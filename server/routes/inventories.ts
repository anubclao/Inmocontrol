import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express from "express";
import { google } from "googleapis";
import crypto from "crypto";
import { Readable } from "stream";
import pool, { ensureDefaultOrg } from "../db.js";
import { isTokenExpiringSoon } from "../lib/googleAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

async function getFreshDriveClient() {
  const [rows] = await pool.query<any[]>(
    "SELECT access_token, refresh_token, expiry_date, drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?",
    ["default_user", "google_drive"],
  );
  if (!rows.length || !rows[0].access_token) return null;
  oauth2Client.setCredentials({
    access_token: rows[0].access_token,
    refresh_token: rows[0].refresh_token ?? undefined,
    expiry_date: rows[0].expiry_date ?? undefined,
  });
  if (isTokenExpiringSoon(rows[0].expiry_date)) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await pool.query(
      "UPDATE user_oauth_tokens SET access_token=?, expiry_date=? WHERE user_id=? AND provider=?",
      [
        credentials.access_token,
        credentials.expiry_date,
        "default_user",
        "google_drive",
      ],
    );
  }
  return google.drive({ version: "v3", auth: oauth2Client });
}

/** Busca (o crea) una subcarpeta dentro de otra por nombre. */
async function getOrCreateSubfolder(
  drive: any,
  parentId: string,
  name: string,
): Promise<string> {
  const list = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });
  if (list.data.files?.length) return list.data.files[0].id!;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id!;
}

/**
 * GET /api/inventories?propertyId=...
 * Lista los inventarios (inicial y final) de una propiedad.
 */
router.get("/", async (req, res) => {
  const { propertyId } = req.query as Record<string, string>;
  if (!propertyId) {
    res.status(400).json({ error: "Falta propertyId" });
    return;
  }
  try {
    // FIX: el JSON `photos` puede pesar >500KB por fila (base64). MySQL
    // "Out of sort memory" cuando ORDER BY usa una columna de tamaño comparable.
    // Solución: primero listar IDs (liviano), luego traer las filas completas
    // sin ORDER BY (solo 1 fila por phase normalmente).
    const [idRows] = await pool.query<any[]>(
      `SELECT id, phase FROM inventories WHERE property_id = ? ORDER BY id DESC`,
      [propertyId],
    );
    if (idRows.length === 0) {
      res.json({ inventories: [] });
      return;
    }
    const ids = idRows.map((r) => r.id);
    const [rows] = await pool.query<any[]>(
      `SELECT id, property_id, contract_id, phase, property_type, counters, areas, photos,
              signatures, custom_areas, signed_at, created_at, updated_at
       FROM inventories
       WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    // mysql2 ya devuelve JSON como parsed object
    res.json({ inventories: rows });
  } catch (err: any) {
    console.error("[GET /api/inventories]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inventories
 * Crea o actualiza el inventario (inicial o final) de una propiedad.
 * Body: { id?, propertyId, phase ('inicial'|'final'), propertyType, counters, areas,
 *         photos, signatures?, customAreas?, signedAt? }
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body as {
      id?: string;
      propertyId: string;
      phase: "inicial" | "final";
      propertyType: string;
      counters: any;
      areas: any;
      photos?: any[];
      signatures?: any[];
      customAreas?: any[];
      signedAt?: string | null;
      contractId?: string | null;
    };

    if (!body.propertyId || !body.phase || !body.propertyType) {
      res
        .status(400)
        .json({ error: "Faltan: propertyId, phase, propertyType" });
      return;
    }
    if (!["inicial", "final"].includes(body.phase)) {
      res.status(400).json({ error: "phase debe ser 'inicial' o 'final'" });
      return;
    }
    const orgId = await ensureDefaultOrg();

    // `inventories.id` es CHAR(36) en MySQL. Si el cliente envía un id ≤36 chars lo usamos
    // (compat con la convención UUID). Si no, generamos uno nuevo — NUNCA concatenar con ':'.
    const id = body.id && body.id.length <= 36 ? body.id : crypto.randomUUID();
    await pool.query(
      `INSERT INTO inventories
        (id, organization_id, property_id, contract_id, phase, property_type,
         counters, areas, photos, signatures, custom_areas, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         contract_id = COALESCE(VALUES(contract_id), contract_id),
         property_type = VALUES(property_type),
         counters = VALUES(counters),
         areas = VALUES(areas),
         photos = VALUES(photos),
         signatures = VALUES(signatures),
         custom_areas = VALUES(custom_areas),
         signed_at = VALUES(signed_at),
         updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        orgId,
        body.propertyId,
        body.contractId ?? null,
        body.phase,
        body.propertyType,
        JSON.stringify(body.counters ?? {}),
        JSON.stringify(body.areas ?? []),
        JSON.stringify(body.photos ?? []),
        JSON.stringify(body.signatures ?? []),
        JSON.stringify(body.customAreas ?? []),
        body.signedAt ?? null,
      ],
    );
    res.json({ success: true, inventoryId: id });
  }),
);

/**
 * POST /api/inventories/upload-photos
 * Sube fotos individuales del inventario a una subcarpeta dedicada en Drive.
 * Body: { propertyId, phase, photos: [{ name, base64Data }] }
 *
 * Crea/usa la carpeta `Inventario captacion/` (singular, convención del usuario)
 * para las fotos del inventario de captación, y `Inventario colocacion/` para
 * el de colocación. Distingue las fotos individuales del PDF consolidado
 * que va en la carpeta `Inventarios/`.
 *
 * El frontend sigue guardando las fotos en IndexedDB como cache local de
 * lectura rápida, pero Drive queda como fuente de verdad (cross-device).
 */
router.post("/upload-photos", async (req, res) => {
  const { propertyId, phase, photos } = req.body as {
    propertyId: string;
    phase: "inicial" | "final";
    photos: Array<{ name: string; base64Data: string }>;
  };

  if (!propertyId || !phase || !Array.isArray(photos) || photos.length === 0) {
    res.status(400).json({ error: "Faltan: propertyId, phase, photos[]" });
    return;
  }

  let drive: any = null;
  try {
    drive = await getFreshDriveClient();
  } catch {
    // sin drive
  }
  if (!drive) {
    res.status(401).json({ error: "No conectado a Google Drive" });
    return;
  }

  const [propRows] = await pool.query<any[]>(
    "SELECT address, drive_folder_id FROM properties WHERE id = ?",
    [propertyId],
  );
  if (!propRows.length || !propRows[0].drive_folder_id) {
    res.status(404).json({ error: "La propiedad no tiene carpeta en Drive" });
    return;
  }
  const propertyFolderId = propRows[0].drive_folder_id;

  // Carpeta específica para fotos. "Inventario captacion" / "Inventario colocacion"
  // (singular) — separa las fotos individuales del PDF consolidado que va en "Inventarios/".
  const folderName =
    phase === "inicial" ? "Inventario captacion" : "Inventario colocacion";
  const photosFolderId = await getOrCreateSubfolder(
    drive,
    propertyFolderId,
    folderName,
  );

  const uploaded: Array<{ name: string; webViewLink: string; fileId: string }> =
    [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const photo of photos) {
    if (!photo?.name || !photo?.base64Data) {
      failed.push({
        name: photo?.name ?? "?",
        error: "missing name or base64Data",
      });
      continue;
    }
    try {
      let mimeType = "image/jpeg";
      const m = /^data:([^;]+);base64,/.exec(photo.base64Data);
      if (m) mimeType = m[1];
      const cleanBase64 = photo.base64Data.replace(/^data:[^;]+;base64,/, "");

      const buffer = Buffer.from(cleanBase64, "base64");
      const result = await drive.files.create({
        requestBody: { name: photo.name, parents: [photosFolderId] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: "id, webViewLink",
      });

      await drive.permissions.create({
        fileId: result.data.id!,
        requestBody: { role: "reader", type: "anyone" },
      });

      uploaded.push({
        name: photo.name,
        webViewLink: result.data.webViewLink!,
        fileId: result.data.id!,
      });
    } catch (err) {
      console.warn(
        `[upload-photos] falló ${photo.name}:`,
        (err as Error).message,
      );
      failed.push({ name: photo.name, error: (err as Error).message });
    }
  }

  res.json({
    success: failed.length === 0,
    folderName,
    folderId: photosFolderId,
    uploaded,
    failed,
  });
});

/**
 * POST /api/inventories/upload-pdf
 * Sube el PDF generado del inventario a Drive.
 * Body: { propertyId, phase ('inicial'|'final'), base64Data, inventoryDate (YYYY-MM-DD)? }
 * Guarda la URL en la propiedad (drive_folder_path) para referencia futura.
 */
router.post("/upload-pdf", async (req, res) => {
  const { propertyId, phase, base64Data, inventoryDate } = req.body as {
    propertyId: string;
    phase: "inicial" | "final";
    base64Data: string;
    inventoryDate?: string;
  };

  if (!propertyId || !phase || !base64Data) {
    res.status(400).json({ error: "Faltan: propertyId, phase, base64Data" });
    return;
  }

  let drive: any = null;
  try {
    drive = await getFreshDriveClient();
  } catch {
    // sin drive
  }
  if (!drive) {
    res.status(401).json({ error: "No conectado a Google Drive" });
    return;
  }

  // 1. Buscar la carpeta del inmueble
  const [propRows] = await pool.query<any[]>(
    "SELECT address, drive_folder_id, drive_folder_path FROM properties WHERE id = ?",
    [propertyId],
  );
  if (!propRows.length || !propRows[0].drive_folder_id) {
    res.status(404).json({ error: "La propiedad no tiene carpeta en Drive" });
    return;
  }
  const propertyFolderId = propRows[0].drive_folder_id;

  // 2. Buscar/crear subcarpeta "Inventarios"
  const inventariosFolderId = await getOrCreateSubfolder(
    drive,
    propertyFolderId,
    "Inventarios",
  );

  // 3. Generar nombre de archivo
  const phaseLabel = phase === "inicial" ? "Captacion" : "Colocacion";
  const date = inventoryDate ?? new Date().toISOString().slice(0, 10);
  const fileName = `Inventario_${phaseLabel}_${date}.pdf`;

  // 4. Subir el PDF
  const buffer = Buffer.from(
    base64Data.replace(/^data:application\/pdf;base64,/, ""),
    "base64",
  );
  const uploaded = await drive.files.create({
    requestBody: { name: fileName, parents: [inventariosFolderId] },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });

  // Hacer público el link
  await drive.permissions.create({
    fileId: uploaded.data.id!,
    requestBody: { role: "reader", type: "anyone" },
  });

  // 5. Guardar la URL en la propiedad según la fase.
  //    Las columnas `inventory_captacion_pdf_url` / `inventory_colocacion_pdf_url`
  //    se crean en la migración 009. Si el server se deploya antes de aplicarla,
  //    este UPDATE va a fallar con ER_BAD_FIELD_ERROR — el flujo retorna 500
  //    limpio (sin la rama defensiva de antes, que usaba `ADD COLUMN IF NOT EXISTS`,
  //    sintaxis de PostgreSQL que rompe en MySQL 8).
  const urlField =
    phase === "inicial"
      ? "inventory_captacion_pdf_url"
      : "inventory_colocacion_pdf_url";
  await pool.query(`UPDATE properties SET ${urlField} = ? WHERE id = ?`, [
    uploaded.data.webViewLink,
    propertyId,
  ]);

  res.json({
    success: true,
    fileId: uploaded.data.id,
    fileName,
    webViewLink: uploaded.data.webViewLink,
    folderPath: `${propRows[0].drive_folder_path ?? ""}/Inventarios`,
  });
});

export default router;
