import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express from "express";
import crypto from "crypto";
import pool from "../db.js";
// FIX 2026-09-25 (saas_multitenant.md): usar getOrgIdForRequest en vez de
// ensureDefaultOrg() para que el orgId venga del req.user, no del primero
// de la tabla. ensureDefaultOrg() se mantiene para bootstrap/tests.
import { getOrgIdForRequest } from "../lib/orgContext.js";
import { getDriveClientForRequest, getDriveContext } from "../lib/driveClient.js";
import { asyncHandler } from "../lib/asyncHandler.js";
// Auditoría Hostinger (oct-2026): tope explícito por endpoint (413) en vez de
// dejar que el único límite sea el envelope global de 15 MB.
import {
  assertBase64Size,
  base64DecodedBytes,
  formatMb,
  MAX_PDF_BYTES,
  MAX_PHOTO_BATCH_BYTES,
  stripDataUrlPrefix,
} from "../lib/uploadLimits.js";
import { payloadTooLarge } from "../lib/errors.js";
// Reemplaza al `withTimeout` local: timeout con abort REAL + reintentos en
// lecturas + upsert idempotente. El local cortaba la espera pero dejaba la
// subida corriendo en background (dos uploads si el usuario reintentaba).
import {
  findOrCreateFolder,
  runDrive,
  upsertFileInFolder,
} from "../lib/driveGuard.js";

const router = express.Router();

// FIX #1/#2 (P0 seguridad): requireAuth en todas las rutas de inventories.
import { requireAuth } from "./auth.js";
// fix-issue-permissions-by-endpoint: requireRole valida acción específica.
import { requireRole } from "../middleware/requireRole.js";
router.use(requireAuth);

/**
 * Verifica que la propiedad exista Y pertenezca a la organización de la
 * request. Devuelve la fila (address, drive_folder_id, drive_folder_path) o
 * `null`.
 *
 * Antes los endpoints de inventario filtraban solo por `propertyId`, que viene
 * del cliente: un usuario de otra organización podía leer/escribir inventarios
 * ajenos si adivinaba el UUID (IDOR). `properties.organization_id` es NOT NULL,
 * así que el filtro es seguro.
 */
async function findPropertyInOrg(propertyId: string, orgId: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT address, drive_folder_id, drive_folder_path
       FROM properties
      WHERE id = ? AND organization_id = ?`,
    [propertyId, orgId],
  );
  return rows[0] ?? null;
}

/** Busca (o crea) una subcarpeta dentro de otra por nombre.
 *
 * Delega en `findOrCreateFolder` (driveGuard): timeout con abort real y
 * búsqueda idempotente con reintentos. Antes usaba `withTimeout`, que cortaba
 * la espera pero dejaba la request a Google corriendo en background — si el
 * usuario reintentaba, quedaban dos creaciones en paralelo.
 */
async function getOrCreateSubfolder(
  drive: any,
  parentId: string,
  name: string,
): Promise<string> {
  const { id } = await findOrCreateFolder(drive, name, parentId);
  return id;
}

/**
 * GET /api/inventories?propertyId=...
 * Lista los inventarios (inicial y final) de una propiedad.
 */
// BUG-029: migrado a asyncHandler.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { propertyId } = req.query as Record<string, string>;
    if (!propertyId) {
      res.status(400).json({ error: "Falta propertyId" });
      return;
    }
    // Aislamiento por organización: sin esto, cualquier usuario autenticado
    // podía leer los inventarios de otra inmobiliaria con solo el UUID.
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      res.status(401).json({
        error: "Sesión inválida",
        code: "SESSION_MISSING_ORG",
      });
      return;
    }
    const property = await findPropertyInOrg(propertyId, _ctx.orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
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
  }),
);

/**
 * POST /api/inventories
 * Crea o actualiza el inventario (inicial o final) de una propiedad.
 * Body: { id?, propertyId, phase ('inicial'|'final'), propertyType, counters, areas,
 *         photos, signatures?, customAreas?, signedAt? }
 */
router.post(
  "/",
  requireRole("canAddInventory"),
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
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;

    // La propiedad tiene que ser de esta organización (FK + aislamiento).
    const property = await findPropertyInOrg(body.propertyId, orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }

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
    // El UPSERT puede haber caído sobre la fila existente de (property_id,
    // phase) — la tabla tiene `uniq_inventory_property_phase`. Devolvemos el id
    // REALMENTE persistido: antes respondíamos el `id` generado en esta request,
    // que podía no existir en la DB (contrato mentiroso).
    const [stored] = await pool.query<any[]>(
      "SELECT id FROM inventories WHERE property_id = ? AND phase = ? LIMIT 1",
      [body.propertyId, body.phase],
    );
    res.json({ success: true, inventoryId: stored[0]?.id ?? id });
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
// BUG-029: migrado a asyncHandler.
router.post(
  "/upload-photos",
  requireRole("canAddInventory"),
  asyncHandler(async (req, res) => {
    const { propertyId, phase, photos } = req.body as {
      propertyId: string;
      phase: "inicial" | "final";
      photos: Array<{ name: string; base64Data: string }>;
    };

    if (
      !propertyId ||
      !phase ||
      !Array.isArray(photos) ||
      photos.length === 0
    ) {
      res.status(400).json({ error: "Faltan: propertyId, phase, photos[]" });
      return;
    }

    // Límite por lote ANTES de decodificar: evita el pico de RAM de un base64
    // gigante y le dice al cliente cuál es el máximo. El frontend ya corta en
    // lotes de 6 M chars (driveService), esto es la red de seguridad.
    const batchBytes = photos.reduce(
      (acc, p) => acc + base64DecodedBytes(p?.base64Data ?? ""),
      0,
    );
    if (batchBytes > MAX_PHOTO_BATCH_BYTES) {
      throw payloadTooLarge(
        `Lote de fotos demasiado grande: ${formatMb(batchBytes)} (máximo ${formatMb(MAX_PHOTO_BATCH_BYTES)}). Mandá menos fotos por lote.`,
      );
    }

    // Cliente de Drive del usuario de la sesión (no `default_user` hardcodeado).
    const drive = await getDriveClientForRequest(req);
    if (!drive) {
      res.status(401).json({
        error: "No conectado a Google Drive",
        code: "DRIVE_NOT_CONNECTED",
      });
      return;
    }

    // Aislamiento por organización + carpeta Drive de la propiedad.
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
      return;
    }
    const property = await findPropertyInOrg(propertyId, _ctx.orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    if (!property.drive_folder_id) {
      res.status(404).json({ error: "La propiedad no tiene carpeta en Drive" });
      return;
    }
    const propertyFolderId = property.drive_folder_id;

    // Carpeta específica para fotos. "Inventario captacion" / "Inventario colocacion"
    // (singular) — separa las fotos individuales del PDF consolidado que va en "Inventarios/".
    const folderName =
      phase === "inicial" ? "Inventario captacion" : "Inventario colocacion";
    const photosFolderId = await getOrCreateSubfolder(
      drive,
      propertyFolderId,
      folderName,
    );

    const uploaded: Array<{
      name: string;
      webViewLink: string;
      fileId: string;
    }> = [];
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

        const buffer = Buffer.from(stripDataUrlPrefix(photo.base64Data), "base64");
        // upsert por nombre: si el lote se reintenta (timeout que en realidad
        // se completó en Google), no queda la foto duplicada.
        const result = await upsertFileInFolder(drive, {
          name: photo.name,
          parentId: photosFolderId,
          mimeType,
          body: buffer,
        });

        await runDrive(`permissions.create (photo ${photo.name})`, (signal) =>
          drive.permissions.create(
            {
              fileId: result.id,
              requestBody: { role: "reader", type: "anyone" },
            },
            { signal },
          ),
        );

        uploaded.push({
          name: photo.name,
          webViewLink: result.webViewLink!,
          fileId: result.id,
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
  }),
);

/**
 * POST /api/inventories/upload-pdf
 * Sube el PDF generado del inventario a Drive.
 * Body: { propertyId, phase ('inicial'|'final'), base64Data, inventoryDate (YYYY-MM-DD)? }
 * Guarda la URL en la propiedad (drive_folder_path) para referencia futura.
 */
// BUG-029: migrado a asyncHandler.
router.post(
  "/upload-pdf",
  requireRole("canAddInventory"),
  asyncHandler(async (req, res) => {
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

    assertBase64Size(base64Data, MAX_PDF_BYTES, "El PDF del inventario");

    // Cliente de Drive del usuario de la sesión.
    const drive = await getDriveClientForRequest(req);
    if (!drive) {
      res.status(401).json({
        error: "No conectado a Google Drive",
        code: "DRIVE_NOT_CONNECTED",
      });
      return;
    }

    // 1. Buscar la carpeta del inmueble (con aislamiento por organización)
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
      return;
    }
    const property = await findPropertyInOrg(propertyId, _ctx.orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    if (!property.drive_folder_id) {
      res.status(404).json({ error: "La propiedad no tiene carpeta en Drive" });
      return;
    }
    const propertyFolderId = property.drive_folder_id;

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
    const buffer = Buffer.from(stripDataUrlPrefix(base64Data), "base64");
    // BUG-014: el catch devuelve 503 con mensaje accionable en vez de HTML 500.
    // Auditoría Hostinger: `upsertFileInFolder` + `runDrive` reemplazan a
    // `withTimeout`, que cortaba la espera pero NO cancelaba la subida (un
    // reintento dejaba dos uploads en paralelo y, peor, dos PDFs en Drive).
    let uploaded;
    try {
      const file = await upsertFileInFolder(drive, {
        name: fileName,
        parentId: inventariosFolderId,
        mimeType: "application/pdf",
        body: buffer,
      });
      uploaded = { data: { id: file.id, webViewLink: file.webViewLink } };

      // Hacer público el link
      await runDrive(`permissions.create (${fileName})`, (signal) =>
        drive.permissions.create(
          {
            fileId: file.id,
            requestBody: { role: "reader", type: "anyone" },
          },
          { signal },
        ),
      );
    } catch (err: any) {
      console.error("[upload-pdf] drive failed:", err);
      if (err?.code === "DRIVE_TIMEOUT" || err?.message?.includes("Timeout")) {
        return res.status(503).json({
          error: "Drive no responde. Reintentá en unos segundos.",
        });
      }
      return res
        .status(500)
        .json({ error: err?.message ?? "Error subiendo PDF" });
    }

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
    await pool.query(
      `UPDATE properties SET ${urlField} = ?
        WHERE id = ? AND organization_id = ?`,
      [uploaded.data.webViewLink, propertyId, _ctx.orgId],
    );

    res.json({
      success: true,
      fileId: uploaded.data.id,
      fileName,
      webViewLink: uploaded.data.webViewLink,
      folderPath: `${property.drive_folder_path ?? ""}/Inventarios`,
    });
  }),
);

export default router;
