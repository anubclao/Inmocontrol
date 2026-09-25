import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express from "express";
import { google } from "googleapis";
import crypto from "crypto";
import { Readable } from "stream";
import pool, { ensureDefaultOrg } from "../db.js";
import { isTokenExpiringSoon } from "../lib/googleAuth.js";
import { escapeDriveQueryValue } from "../lib/driveHelpers.js";

/**
 * FIX 2026-07-22: timeout estricto para llamadas a Google Drive.
 * Sin esto, si Google está lento o inalcanzable desde el server de
 * Hostinger, `drive.files.create/list` se cuelga para siempre y el
 * request POST /api/tenants nunca termina. Mismo problema que
 * documenté en properties.ts (mismo fix). 8s es generoso (Google
 * suele responder en <2s) y evita que un problema de red tire abajo
 * el guardado del inquilino.
 */
const GOOGLE_API_TIMEOUT_MS = 8_000;

function withTimeout<T = any>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout after ${ms}ms: ${label}`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const router = express.Router();

// FIX #1/#2 (P0 seguridad): requireAuth en todas las rutas de tenants.
// Antes el endpoint estaba abierto a cualquiera con la URL → IDOR total
// en multi-tenant. Single-tenant piloto OK, pero al migrar a SaaS rompe.
// El endpoint `/api/auth/*` ya tiene su propio manejo (ver server/routes/auth.ts).
import { requireAuth } from "./auth.js";
// fix-issue-permissions-by-endpoint: requireRole valida acción específica.
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
router.use(requireAuth);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

/** Helper: obtiene tokens del usuario actual (hardcodeado por ahora). */
async function getUserTokens() {
  const userId = "default_user";
  const [rows] = await pool.query<any[]>(
    "SELECT access_token, refresh_token, expiry_date, drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?",
    [userId, "google_drive"],
  );
  if (!rows.length || !rows[0].access_token) return null;
  return rows[0];
}

/** Helper: asegura tokens frescos. */
async function getFreshDriveClient() {
  const tokens = await getUserTokens();
  if (!tokens) throw new Error("No Drive connection");
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  });
  if (isTokenExpiringSoon(tokens.expiry_date)) {
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

/**
 * POST /api/tenants
 * Crea un arrendatario en MySQL y su carpeta en Google Drive.
 * Body: { propertyId, name, idNumber, email, phone, rent }
 */
// BUG-029: migrado a asyncHandler (reemplaza top-level try/catch).
router.post("/", requireRole("canAddTenant"), asyncHandler(async (req, res) => {
  // FIX 2026-07-22: top-level try/catch para que cualquier error no
  // atrapado devuelva JSON (antes devolvía HTML 500 y el frontend
  // tiraba SyntaxError).
  try {
    const { propertyId, name, idNumber, email, phone, rent, leaseStartDate } =
      req.body as {
        propertyId: string;
        name: string;
        idNumber: string;
        email?: string;
        phone?: string;
        rent?: number;
        leaseStartDate?: string;
      };

    if (!propertyId || !name || !idNumber) {
      res.status(400).json({
        error: "Faltan campos requeridos: propertyId, name, idNumber",
      });
      return;
    }

    // Validación: un inmueble solo puede tener UN arrendatario activo a la vez.
    // (Futuro: un mismo arrendatario SÍ puede arrendar varios inmuebles — esto
    // solo valida la dirección 1-propiedad → 1-tenant, no 1-tenant → N-propiedades.)
    try {
      const [existing] = await pool.query<any[]>(
        `SELECT id, name FROM tenants WHERE property_id = ? AND status = 'Activo' LIMIT 1`,
        [propertyId],
      );
      if (existing.length > 0) {
        res.status(409).json({
          error: `Este inmueble ya tiene un arrendatario activo (${existing[0].name}). Finaliza o cancela ese contrato antes de asignar uno nuevo.`,
        });
        return;
      }
    } catch (err: any) {
      console.error("[DB] Error validando duplicado de tenant:", err.message);
      res
        .status(500)
        .json({ error: "Error validando disponibilidad del inmueble" });
      return;
    }

    const tenantId = crypto.randomUUID();

    let propertyDriveFolderId = (req.body as any).propertyDriveFolderId as
      | string
      | null
      | undefined;
    const propertyAddress = (req.body as any).propertyAddress as
      | string
      | undefined;
    const adminFee = (req.body as any).adminFee ?? 0;

    let tenantDriveFolderId: string | null = null;

    // 1. Si Drive está conectado, asegurar que existe la carpeta del inmueble
    let drive: any = null;
    try {
      drive = await getFreshDriveClient();
    } catch {
      console.warn("[Drive] No conectado o no se pudo obtener cliente");
    }

    if (drive) {
      try {
        // 1a. Si no hay carpeta del inmueble, crearla
        if (!propertyDriveFolderId && propertyAddress) {
          const [tokensRows] = await withTimeout(
            pool.query<any[]>(
              "SELECT drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?",
              ["default_user", "google_drive"],
            ),
            GOOGLE_API_TIMEOUT_MS,
            "tokens SELECT (tenant POST)",
          );
          const rootFolderId = tokensRows[0]?.drive_folder_id;

          if (rootFolderId) {
            // BUG-010: usar el helper central de escape (mismo patrón que
            // properties.ts). Escapa `\` antes que `'` — el orden importa.
            const safeAddress = escapeDriveQueryValue(propertyAddress);
            // Buscar si ya existe una carpeta con este address
            const existing = await withTimeout(
              drive.files.list({
                q: `name='${safeAddress}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
                fields: "files(id)",
                spaces: "drive",
              }),
              GOOGLE_API_TIMEOUT_MS,
              "drive.files.list (property folder)",
            );

            let propertyFolderId = existing.data.files?.[0]?.id;
            if (!propertyFolderId) {
              const created = await withTimeout(
                drive.files.create({
                  requestBody: {
                    name: propertyAddress,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [rootFolderId],
                  },
                  fields: "id",
                }),
                GOOGLE_API_TIMEOUT_MS,
                "drive.files.create (property folder)",
              );
              propertyFolderId = created.data.id!;
              console.log(
                `[Drive] Carpeta de inmueble creada: "${propertyAddress}" → ${propertyFolderId}`,
              );
            }
            propertyDriveFolderId = propertyFolderId;
          }
        }

        // 1b. Crear carpeta del arrendatario dentro de la carpeta del inmueble
        if (propertyDriveFolderId) {
          const folderName = `${name.trim()} (${String(idNumber).replace(/\D/g, "")})`;
          // BUG-009: dedupe — antes de crear, chequear si ya existe una
          // carpeta con este nombre dentro del parent. Si existe (caso
          // doble-click), la reusamos en vez de duplicar.
          const existingTenantFolder = await withTimeout(
            drive.files.list({
              q: `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${propertyDriveFolderId}' in parents and trashed=false`,
              fields: "files(id)",
              spaces: "drive",
            }),
            GOOGLE_API_TIMEOUT_MS,
            "drive.files.list (tenant folder)",
          );
          const existingId = existingTenantFolder.data.files?.[0]?.id;
          if (existingId) {
            tenantDriveFolderId = existingId;
            console.log(
              `[Drive] Carpeta de arrendatario ya existía: "${folderName}" → ${tenantDriveFolderId} (reusada por dedupe)`,
            );
          } else {
            const folderRes = await withTimeout(
              drive.files.create({
                requestBody: {
                  name: folderName,
                  mimeType: "application/vnd.google-apps.folder",
                  parents: [propertyDriveFolderId],
                },
                fields: "id",
              }),
              GOOGLE_API_TIMEOUT_MS,
              "drive.files.create (tenant folder)",
            );
            tenantDriveFolderId = folderRes.data.id!;
            console.log(
              `[Drive] Carpeta de arrendatario creada: "${folderName}" → ${tenantDriveFolderId}`,
            );
          }

          // Subcarpetas: Cedula, Contrato, Recibos
          // BUG-009: también dedupe para subcarpetas. Son 3 fijas, pero si el
          // reintento llega después de que se crearon algunas, las faltantes
          // se crean sin duplicar las que ya están.
          const subfolders = ["Cedula", "Contrato", "Recibos"];
          for (const sf of subfolders) {
            const existingSub = await withTimeout(
              drive.files.list({
                q: `name='${sf}' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
                fields: "files(id)",
                spaces: "drive",
              }),
              GOOGLE_API_TIMEOUT_MS,
              `drive.files.list (subfolder ${sf})`,
            );
            if (existingSub.data.files?.[0]?.id) continue; // ya existe
            await withTimeout(
              drive.files.create({
                requestBody: {
                  name: sf,
                  mimeType: "application/vnd.google-apps.folder",
                  parents: [tenantDriveFolderId],
                },
                fields: "id",
              }),
              GOOGLE_API_TIMEOUT_MS,
              `drive.files.create (subfolder ${sf})`,
            );
          }
        }
      } catch (err: any) {
        // FIX 2026-07-22: con los timeouts en cada llamada a Drive, el catch
        // ahora también agarra timeouts. Continuamos sin Drive — el tenant
        // se guarda en MySQL igual y la carpeta se puede crear después
        // desde el Detalle del Inmueble.
        console.warn(
          "[Drive] Error creando carpetas (continuando sin Drive):",
          err.message,
        );
        tenantDriveFolderId = null;
      }
    }

    // 3. Guardar en MySQL (usamos ensureDefaultOrg() que devuelve el UUID de la org)
    try {
      const orgId = await ensureDefaultOrg();
      // Si propertyId viene vacío o apunta a un ID inexistente en MySQL, lo guardamos NULL
      let safePropertyId: string | null = null;
      if (propertyId) {
        const [propRows] = await pool.query<any[]>(
          "SELECT id FROM properties WHERE id = ?",
          [propertyId],
        );
        if (propRows.length > 0) {
          safePropertyId = propertyId;
        } else {
          console.warn(
            `[tenants] propertyId=${propertyId} no existe en BD, guardando NULL`,
          );
        }
      }

      await pool.query(
        `INSERT INTO tenants
        (id, organization_id, property_id, name, document_id, email, phone, rent, admin_fee, lease_start_date, status, tenant_drive_folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo', ?)`,
        [
          tenantId,
          orgId, // UUID real de la org
          safePropertyId,
          name.toUpperCase(),
          idNumber,
          email || null,
          phone || null,
          rent || null,
          adminFee,
          leaseStartDate || null,
          tenantDriveFolderId,
        ],
      );
    } catch (err: any) {
      console.error("[DB] Error insertando tenant:", err.message);
      res
        .status(500)
        .json({ error: "Error guardando arrendatario: " + err.message });
      return;
    }

    res.json({
      success: true,
      tenantId,
      tenantDriveFolderId,
      propertyDriveFolderId: propertyDriveFolderId ?? null,
      message: tenantDriveFolderId
        ? "Arrendatario creado con carpeta en Google Drive"
        : "Arrendatario creado (sin Drive — conecta tu Google Drive en Configuración)",
    });
  } catch (err: any) {
    console.error("[POST /api/tenants] UNHANDLED:", err.message ?? err);
    if (err?.stack) console.error(err.stack);
    if (!res.headersSent) {
      res.status(500).json({
        error:
          "Error inesperado creando arrendatario: " +
          (err.message ?? String(err)),
      });
    }
  }
}));

/**
 * GET /api/tenants
 * Lista todos los arrendatarios desde MySQL.
 */
// BUG-029: migrado a asyncHandler.
router.get("/", asyncHandler(async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const [rows] = await pool.query<any[]>(
    `SELECT id, property_id, name, document_id, email, phone, rent, admin_fee, lease_start_date, status,
            tenant_drive_folder_id, drive_folder_path, created_at
     FROM tenants
     WHERE organization_id = ?
     ORDER BY created_at DESC`,
    [orgId],
  );
  res.json({ tenants: rows });
}));

/**
 * Helper: busca (o crea si no existe) la carpeta del tenant en Drive.
 * Devuelve siempre el ID de la carpeta del tenant (nunca falla si Drive
 * está conectado y el tenant tiene `property_id`).
 *
 * Estructura esperada:
 *   {rootFolder}/
 *     └─ {dirección del inmueble}/          ← carpeta de la propiedad
 *          └─ {nombre} ({cédula})/          ← carpeta del tenant  ← esta
 *               ├─ Cedula/
 *               ├─ Contrato/
 *               └─ Recibos/
 */
async function ensureTenantDriveFolder(
  drive: any,
  rootFolderId: string,
  tenant: {
    id: string;
    name: string;
    documentId: string | null;
    propertyId: string | null;
  },
): Promise<string> {
  // 1. Resolver carpeta de la propiedad.
  if (!tenant.propertyId) {
    throw new Error(
      "El arrendatario no tiene propiedad asignada. Asigná primero una propiedad en su ficha para poder crear la carpeta en Drive.",
    );
  }
  const [propRows] = await pool.query<any[]>(
    "SELECT id, address, drive_folder_id FROM properties WHERE id = ?",
    [tenant.propertyId],
  );
  if (propRows.length === 0) {
    throw new Error(
      `La propiedad ${tenant.propertyId} no existe en la base de datos.`,
    );
  }
  const property = propRows[0];

  let propertyFolderId = property.drive_folder_id as string | null | undefined;
  if (!propertyFolderId) {
    // Defensa: propiedad existe en BD pero sin carpeta. Buscar/crear por nombre.
    const address = (property.address ?? "Inmueble").toString();
    const existing = await drive.files.list({
      q: `name='${address.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });
    propertyFolderId = existing.data.files?.[0]?.id;
    if (!propertyFolderId) {
      const created = await drive.files.create({
        requestBody: {
          name: address,
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootFolderId],
        },
        fields: "id",
      });
      propertyFolderId = created.data.id!;
      console.log(
        `[Drive] Carpeta de inmueble creada (recuperación): "${address}" → ${propertyFolderId}`,
      );
    }
    await pool.query("UPDATE properties SET drive_folder_id = ? WHERE id = ?", [
      propertyFolderId,
      tenant.propertyId,
    ]);
  }

  // 2. Buscar/crear carpeta del tenant dentro de la carpeta de la propiedad.
  const folderName = `${tenant.name.trim()} (${String(tenant.documentId ?? "").replace(/\D/g, "")})`;
  const tenantExisting = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${propertyFolderId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });
  let tenantFolderId = tenantExisting.data.files?.[0]?.id;
  if (!tenantFolderId) {
    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [propertyFolderId],
      },
      fields: "id",
    });
    tenantFolderId = created.data.id!;
    console.log(
      `[Drive] Carpeta de arrendatario creada (recuperación): "${folderName}" → ${tenantFolderId}`,
    );
  }

  // 3. Asegurar subcarpetas Cedula / Contrato / Recibos.
  for (const sf of ["Cedula", "Contrato", "Recibos"]) {
    const subExisting = await drive.files.list({
      q: `name='${sf}' and mimeType='application/vnd.google-apps.folder' and '${tenantFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });
    if (!subExisting.data.files?.[0]?.id) {
      await drive.files.create({
        requestBody: {
          name: sf,
          mimeType: "application/vnd.google-apps.folder",
          parents: [tenantFolderId],
        },
        fields: "id",
      });
    }
  }

  return tenantFolderId;
}

/**
 * POST /api/tenants/:id/ensure-drive-folder
 * Crea la carpeta del tenant en Drive si no existe. Idempotente.
 * Útil cuando el tenant se creó sin Drive conectado y quedó con
 * `tenant_drive_folder_id = NULL`. Después de esto, el botón
 * "Abrir Inventario de Colocación" se puede habilitar.
 *
 * Requiere que el tenant tenga `property_id` asignado. Si no, devuelve 400.
 */
// BUG-029: migrado a asyncHandler.
router.post("/:id/ensure-drive-folder", asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Buscar tenant.
  const [rows] = await pool.query<any[]>(
    "SELECT id, name, document_id, property_id, tenant_drive_folder_id FROM tenants WHERE id = ?",
    [id],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Inquilino no encontrado" });
    return;
  }
  const tenant = rows[0];

  // 2. Si ya tiene carpeta, devolverla (idempotente).
  if (tenant.tenant_drive_folder_id) {
    res.json({
      success: true,
      tenantDriveFolderId: tenant.tenant_drive_folder_id,
      created: false,
      message: "El arrendatario ya tiene carpeta en Drive",
    });
    return;
  }

  // 3. Necesitamos Drive conectado.
  let drive: any;
  try {
    drive = await getFreshDriveClient();
  } catch (e: any) {
    res.status(400).json({
      error:
        "No hay conexión con Google Drive. Conectá Drive en Configuración.",
    });
    return;
  }

  // 4. Necesitamos el rootFolderId del usuario.
  const [tokensRows] = await pool.query<any[]>(
    "SELECT drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?",
    ["default_user", "google_drive"],
  );
  const rootFolderId = tokensRows[0]?.drive_folder_id;
  if (!rootFolderId) {
    res.status(400).json({
      error:
        "No hay carpeta raíz de InmoControl configurada en Drive. Reconectá Drive en Configuración.",
    });
    return;
  }

  // 5. Crear la estructura de carpetas.
  const folderId = await ensureTenantDriveFolder(drive, rootFolderId, {
    id: tenant.id,
    name: tenant.name,
    documentId: tenant.document_id,
    propertyId: tenant.property_id,
  });
  await pool.query(
    "UPDATE tenants SET tenant_drive_folder_id = ? WHERE id = ?",
    [folderId, id],
  );
  res.json({
    success: true,
    tenantDriveFolderId: folderId,
    created: true,
    message: "Carpeta de Drive creada y vinculada al arrendatario",
  });
}));

/**
 * POST /api/tenants/:id/link-drive-folder
 * Vincula una carpeta YA EXISTENTE en Drive al tenant en la DB, sin crear
 * nada nuevo. Útil cuando el tenant se creó sin Drive y después se subió
 * la documentación manualmente a una carpeta existente que hay que vincular.
 *
 * Body: { driveFolderId: string, createSubfolders?: boolean }
 */
// BUG-029: migrado a asyncHandler.
router.post("/:id/link-drive-folder", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { driveFolderId, createSubfolders } = req.body as {
    driveFolderId?: string;
    createSubfolders?: boolean;
  };

  if (!driveFolderId) {
    res.status(400).json({ error: "Falta driveFolderId en el body" });
    return;
  }

  const [rows] = await pool.query<any[]>(
    "SELECT id, tenant_drive_folder_id FROM tenants WHERE id = ?",
    [id],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Inquilino no encontrado" });
    return;
  }

  // Validar que la carpeta existe en Drive.
  let drive: any;
  try {
    drive = await getFreshDriveClient();
  } catch {
    res.status(400).json({ error: "No hay conexión con Google Drive" });
    return;
  }

  const meta = await drive.files.get({
    fileId: driveFolderId,
    fields: "id, name, mimeType, trashed",
  });
  if (meta.data.trashed) {
    res
      .status(400)
      .json({ error: "La carpeta está en la papelera de Drive" });
    return;
  }
  if (meta.data.mimeType !== "application/vnd.google-apps.folder") {
    res.status(400).json({
      error: `El ID apunta a un archivo (${meta.data.name}), no a una carpeta`,
    });
    return;
  }

  // Si pidió crear subcarpetas, las creamos dentro de la carpeta vinculada.
  if (createSubfolders) {
    for (const sf of ["Cedula", "Contrato", "Recibos"]) {
      const subExisting = await drive.files.list({
        q: `name='${sf}' and mimeType='application/vnd.google-apps.folder' and '${driveFolderId}' in parents and trashed=false`,
        fields: "files(id)",
        spaces: "drive",
      });
      if (!subExisting.data.files?.[0]?.id) {
        await drive.files.create({
          requestBody: {
            name: sf,
            mimeType: "application/vnd.google-apps.folder",
            parents: [driveFolderId],
          },
          fields: "id",
        });
      }
    }
  }

  await pool.query(
    "UPDATE tenants SET tenant_drive_folder_id = ? WHERE id = ?",
    [driveFolderId, id],
  );
  res.json({
    success: true,
    tenantDriveFolderId: driveFolderId,
    folderName: meta.data.name,
    message: `Carpeta "${meta.data.name}" vinculada al arrendatario`,
  });
}));

/**
 * GET /api/tenants/:id/documents?folder=Cedula
 * Lista los archivos existentes en una subcarpeta del inquilino en Drive.
 * Se usa para saber si la cédula ya está subida (aunque el cliente haya
 * refrescado la página y perdido el uploadStatus local).
 */
// BUG-029: migrado a asyncHandler.
router.get("/:id/documents", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const folder = (req.query.folder as string) || "Cedula";

  const allowedFolders = ["Cedula", "Contrato", "Recibos", "Acta"];
  if (!allowedFolders.includes(folder)) {
    res
      .status(400)
      .json({ error: `Carpeta inválida. Usa: ${allowedFolders.join(", ")}` });
    return;
  }

  try {
    const [rows] = await pool.query<any[]>(
      "SELECT tenant_drive_folder_id FROM tenants WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Inquilino no encontrado" });
      return;
    }
    const tenantDriveFolderId = rows[0]?.tenant_drive_folder_id;
    if (!tenantDriveFolderId) {
      res.json({ files: [] });
      return;
    }

    const drive = await getFreshDriveClient();
    const subfolderRes = await drive.files.list({
      q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });
    const subfolderId = subfolderRes.data.files?.[0]?.id;
    if (!subfolderId) {
      res.json({ files: [] });
      return;
    }

    const filesRes = await drive.files.list({
      q: `'${subfolderId}' in parents and trashed=false`,
      fields: "files(id, name, webViewLink, mimeType, size, createdTime)",
      spaces: "drive",
      orderBy: "createdTime desc",
    });

    res.json({ files: filesRes.data.files ?? [] });
  } catch (err: any) {
    console.error("[tenants] list documents error:", err.message);
    // No rompas la UI si Drive no responde — devolvé lista vacía.
    res.json({ files: [] });
  }
}));

/**
 * PATCH /api/tenants/:id
 */
// BUG-029: migrado a asyncHandler.
router.patch("/:id", requireRole("canEditTenant"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const allowed = [
    "name",
    "document_id",
    "email",
    "phone",
    "rent",
    "admin_fee",
    "lease_start_date",
    "status",
    "property_id",
  ];
  const updates: string[] = [];
  const values: any[] = [];
  const map: Record<string, string> = {
    idNumber: "document_id",
    leaseStartDate: "lease_start_date",
    propertyId: "property_id",
    adminFee: "admin_fee",
  };

  for (const f of allowed) {
    const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const requestKey = Object.keys(map).find((k) => map[k] === camel) ?? camel;
    if (req.body[requestKey] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[requestKey]);
    }
  }

  if (!updates.length) {
    res.json({ success: true, message: "Nothing to update" });
    return;
  }
  values.push(id);
  const orgId = await ensureDefaultOrg();
  await pool.query(
    `UPDATE tenants SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
    [...values, orgId],
  );
  res.json({ success: true });
}));

/**
 * DELETE /api/tenants/:id
 */
// BUG-029: migrado a asyncHandler.
router.delete("/:id", requireRole("canDeleteTenant"), asyncHandler(async (req, res) => {
  const orgId = await ensureDefaultOrg();
  await pool.query(
    `DELETE FROM tenants WHERE id = ? AND organization_id = ?`,
    [req.params.id, orgId],
  );
  res.json({ success: true });
}));

/**
 * POST /api/tenants/upload-document
 * Sube un documento a una subcarpeta del arrendatario en Drive.
 * Body: { tenantDriveFolderId, folder (Cedula|Contrato|Recibos), fileName, base64Data }
 */
// BUG-029: migrado a asyncHandler.
router.post("/upload-document", requireRole("canManageDrive"), asyncHandler(async (req, res) => {
  const { tenantDriveFolderId, folder, fileName, base64Data } = req.body as {
    tenantDriveFolderId: string;
    folder: string;
    fileName: string;
    base64Data: string;
  };

  if (!tenantDriveFolderId || !folder || !fileName || !base64Data) {
    res.status(400).json({ error: "Faltan campos requeridos" });
    return;
  }

  const allowedFolders = ["Cedula", "Contrato", "Recibos"];
  if (!allowedFolders.includes(folder)) {
    res
      .status(400)
      .json({ error: `Carpeta inválida. Usa: ${allowedFolders.join(", ")}` });
    return;
  }

  try {
    const drive = await getFreshDriveClient();

    // Buscar el ID de la subcarpeta (Cedula/Contrato/Recibos) dentro de la carpeta del arrendatario
    const subfolderRes = await drive.files.list({
      q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });

    const subfolderId = subfolderRes.data.files?.[0]?.id;
    if (!subfolderId) {
      res
        .status(404)
        .json({ error: `Subcarpeta "${folder}" no encontrada en Drive` });
      return;
    }

    // Decodificar base64 a buffer
    const fileBuffer = Buffer.from(base64Data, "base64");

    const uploaded = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [subfolderId],
      },
      media: {
        mimeType: "application/pdf",
        body: Readable.from(fileBuffer),
      },
      fields: "id, webViewLink",
    });

    // Hacer accesible públicamente
    await drive.permissions.create({
      fileId: uploaded.data.id!,
      requestBody: { role: "reader", type: "anyone" },
    });

    console.log(`[Drive] "${fileName}" subido a ${folder} del arrendatario`);
    res.json({
      fileId: uploaded.data.id,
      webViewLink: uploaded.data.webViewLink,
    });
  } catch (err: any) {
    console.error("[Drive] Error subiendo documento:", err.message);
    res.status(500).json({ error: "Error subiendo a Drive: " + err.message });
  }
}));

/**
 * POST /api/tenants/upload-acta
 * Sube el PDF del Acta de Entrega a una subcarpeta "Acta/" del arrendatario
 * (crea la subcarpeta si no existe). Es un caso especial vs /upload-document
 * porque la subcarpeta "Acta" no está pre-creada al crear el inquilino.
 *
 * Body: { tenantDriveFolderId, fileName, base64Data }
 */
// BUG-029: migrado a asyncHandler.
router.post("/upload-acta", requireRole("canManageDrive"), asyncHandler(async (req, res) => {
  const { tenantDriveFolderId, fileName, base64Data } = req.body as {
    tenantDriveFolderId: string;
    fileName: string;
    base64Data: string;
  };

  if (!tenantDriveFolderId || !fileName || !base64Data) {
    res.status(400).json({ error: "Faltan campos requeridos" });
    return;
  }

  try {
    const drive = await getFreshDriveClient();

    // 1. Buscar/crear la subcarpeta "Acta" dentro de la carpeta del inquilino
    let actaFolderId: string | undefined;
    const subfolderRes = await drive.files.list({
      q: `name='Acta' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });
    actaFolderId = subfolderRes.data.files?.[0]?.id;
    if (!actaFolderId) {
      const created = await drive.files.create({
        requestBody: {
          name: "Acta",
          mimeType: "application/vnd.google-apps.folder",
          parents: [tenantDriveFolderId],
        },
        fields: "id",
      });
      actaFolderId = created.data.id!;
      console.log(`[Drive] Subcarpeta Acta/ creada para el arrendatario`);
    }

    // 2. Subir el PDF
    const fileBuffer = Buffer.from(base64Data, "base64");
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [actaFolderId] },
      media: { mimeType: "application/pdf", body: Readable.from(fileBuffer) },
      fields: "id, webViewLink",
    });

    // 3. Hacer accesible públicamente
    await drive.permissions.create({
      fileId: uploaded.data.id!,
      requestBody: { role: "reader", type: "anyone" },
    });

    console.log(`[Drive] Acta "${fileName}" subida a Acta/ del arrendatario`);
    res.json({
      fileId: uploaded.data.id,
      webViewLink: uploaded.data.webViewLink,
    });
  } catch (err: any) {
    console.error("[Drive] Error subiendo acta:", err.message);
    res
      .status(500)
      .json({ error: "Error subiendo acta a Drive: " + err.message });
  }
}));

export default router;
