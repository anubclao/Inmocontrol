import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express from "express";
import { google } from "googleapis";
import crypto from "crypto";
import pool, { ensureDefaultOrg } from "../db.js";
import { isTokenExpiringSoon } from "../lib/googleAuth.js";
import { escapeDriveQueryValue } from "../lib/driveHelpers.js";
import { withTransaction } from "../lib/withTransaction.js";

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

/**
 * Timeout estricto para llamadas a Google OAuth/Drive. Sin esto, si Google
 * está lento o inalcanzable desde el server de Hostinger, el
 * `oauth2Client.refreshAccessToken()` se cuelga para siempre y el request
 * POST /api/properties nunca termina → el frontend ve "el botón no hace
 * nada". 8 segundos es generoso (Google suele responder en <2s) y evita
 * que un problema de red tire abajo el wizard.
 */
const GOOGLE_API_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
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

async function getFreshDriveClient() {
  try {
    const [rows] = await withTimeout(
      pool.query<any[]>(
        "SELECT access_token, refresh_token, expiry_date, drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?",
        ["default_user", "google_drive"],
      ),
      GOOGLE_API_TIMEOUT_MS,
      "user_oauth_tokens SELECT",
    );
    if (!rows.length || !rows[0].access_token) return null;
    oauth2Client.setCredentials({
      access_token: rows[0].access_token,
      refresh_token: rows[0].refresh_token ?? undefined,
      expiry_date: rows[0].expiry_date ?? undefined,
    });
    if (isTokenExpiringSoon(rows[0].expiry_date)) {
      const { credentials } = await withTimeout(
        oauth2Client.refreshAccessToken(),
        GOOGLE_API_TIMEOUT_MS,
        "oauth2 refreshAccessToken",
      );
      oauth2Client.setCredentials(credentials);
      await withTimeout(
        pool.query(
          "UPDATE user_oauth_tokens SET access_token=?, expiry_date=? WHERE user_id=? AND provider=?",
          [
            credentials.access_token,
            credentials.expiry_date,
            "default_user",
            "google_drive",
          ],
        ),
        GOOGLE_API_TIMEOUT_MS,
        "user_oauth_tokens UPDATE",
      );
    }
    return google.drive({ version: "v3", auth: oauth2Client });
  } catch (err: any) {
    // No rompemos el request entero si Drive está lento/caído. El caller
    // chequea `if (drive)` y sigue sin Drive — los docs se subirán después
    // cuando el agente los reintente desde el Detalle del Inmueble.
    console.warn(
      "[Drive] getFreshDriveClient falló (continuando sin Drive):",
      err.message,
    );
    return null;
  }
}

/**
 * TIPOS DE DOCUMENTO VÁLIDOS (CHECK constraint de property_documents.doc_type).
 * El Mandato NO está acá — sigue en properties.mandato_pdf_url.
 */
const DOC_TYPES = {
  cedula: "cedula",
  certificado_tradicion: "certificado_tradicion",
  predial: "predial",
  rut: "rut",
  otro: "otro",
} as const;
type DocType = keyof typeof DOC_TYPES;

/** Tipos de unidades adicionales permitidas. */
const UNIT_TYPES = new Set(["parking", "storage", "other"]);

/**
 * Parsea la key de un slot de documento y devuelve su tipo + (opcional) ownerId
 * o unitId. Soporta 2 formatos:
 *
 *  1. Formato NUEVO (migración 010+): "<docType>:<vínculo>"
 *       - "cedula:<ownerId>"          → ownerId = <ownerId>
 *       - "rut:<ownerId>"             → ownerId = <ownerId>
 *       - "certificado_tradicion:<unitId>" → unitId = <unitId>
 *       - "certificado_tradicion:main"    → unitId = NULL (unidad principal)
 *       - "predial"                    → sin ownerId ni unitId
 *
 *  2. Formato LEGACY (anterior a la migración 010): etiqueta legible
 *       - "Cédula de Ciudadanía"  → cedula, ownerId = NULL (asumimos primer owner)
 *       - "Rut Actualizado"       → rut,    ownerId = NULL
 *       - "Impuesto Predial"      → predial
 *       - "Certificado de Tradición" → certificado_tradicion, unitId = NULL
 *
 * Devuelve `null` si la key no es un doc reconocido.
 */
function parseDocumentKey(
  key: string,
  firstOwnerId: string | null,
): {
  docType: DocType;
  ownerId: string | null;
  unitId: string | null;
} | null {
  // 1. Formato nuevo
  if (key.includes(":")) {
    const [docTypeRaw, link] = key.split(":", 2);
    if (!Object.prototype.hasOwnProperty.call(DOC_TYPES, docTypeRaw))
      return null;
    const docType = docTypeRaw as DocType;
    if (docType === "cedula" || docType === "rut") {
      // link debe ser un ownerId real (no "main")
      return { docType, ownerId: link, unitId: null };
    }
    if (docType === "certificado_tradicion") {
      return { docType, ownerId: null, unitId: link === "main" ? null : link };
    }
    if (docType === "predial") {
      // "predial:algo" no es válido → se rechaza
      return null;
    }
    return { docType, ownerId: null, unitId: null };
  }
  // 2. Formato legacy
  const LEGACY_MAP: Record<
    string,
    { docType: DocType; ownerId: string | null; unitId: string | null }
  > = {
    "Cédula de Ciudadanía": {
      docType: "cedula",
      ownerId: firstOwnerId,
      unitId: null,
    },
    "Rut Actualizado": { docType: "rut", ownerId: firstOwnerId, unitId: null },
    "Impuesto Predial": { docType: "predial", ownerId: null, unitId: null },
    "Certificado de Tradición": {
      docType: "certificado_tradicion",
      ownerId: null,
      unitId: null,
    },
  };
  return LEGACY_MAP[key] ?? null;
}

/**
 * POST /api/properties
 * Crea (o actualiza via UPSERT) una propiedad en MySQL y su carpeta en Drive.
 * Es idempotente: si el `localId` es un id real (no wizard-*), hace UPDATE.
 *
 * Body: { localId?, address, chip, folio, ownerName, ownerIdNumber, ownerPhone?, ownerEmail?,
 *         propertyType?, mandatePdfUrl?, mandateSignedAt?, status?,
 *         owners?: [{ name, idNumber?, phone?, email?, ownershipPct? }],
 *         units?:  [{ type, label, folioMatricula?, areaM2?, notes? }],
 *         documents?: { [slotKey]: url } }
 *
 *   - `slotKey` formato nuevo: "cedula:<ownerId>", "rut:<ownerId>",
 *     "certificado_tradicion:<unitId|"main">", "predial"
 *   - `slotKey` formato legacy: "Cédula de Ciudadanía", "Rut Actualizado", etc.
 *     (se vincula al primer owner y/o a la unidad principal)
 */
router.post("/", async (req, res) => {
  console.log("[POST /api/properties] body:", {
    address: req.body.address,
    owner: req.body.ownerName,
    localId: req.body.localId,
    hasMandate: !!req.body.mandatePdfUrl,
    docsCount: req.body.documents ? Object.keys(req.body.documents).length : 0,
    ownersCount: Array.isArray(req.body.owners) ? req.body.owners.length : 0,
    unitsCount: Array.isArray(req.body.units) ? req.body.units.length : 0,
  });
  const {
    localId,
    chip,
    folio,
    ownerIdNumber,
    ownerPhone,
    ownerEmail,
    propertyType,
    mandatePdfUrl,
    mandateSignedAt,
    inventoryCaptacionPdfUrl,
    inventoryColocacionPdfUrl,
    status,
    owners,
    units,
    documents,
  } = req.body as Record<string, any>;

  // FIX 2026-08-05: en el caso "doc-only update" (POST con localId + documents
  // pero sin address/ownerName), re-leemos los valores del row existente más
  // abajo y los metemos en estas variables. Necesitamos `let` para reasignar.
  let { address, ownerName } = req.body as Record<string, any>;

  // FIX 2026-07-22: top-level try/catch para garantizar respuesta JSON.
  // Antes, si algo throw-eaba entre los try/catch internos (ej: el Drive
  // folder creation, el ensureDefaultOrg, o algo en el body parsing),
  // Express agarraba con su default error handler y devolvía HTML 500.
  // Ahora todo error no manejado se convierte en JSON 500, así el
  // frontend puede mostrarlo en consola y el usuario no se queda
  // colgado con "el botón no hace nada".
  try {
    const isUpsert = !!(localId && !String(localId).startsWith("wizard-"));
    // Validación: address + ownerName son requeridos SOLO para INSERT.
    // Para UPSERT, son opcionales — el cliente que sube un doc desde la
    // card del Detalle del Inmueble (sub-flujo) manda solo `documents` y
    // `localId`. Leemos address/ownerName del row existente en ese caso.
    if (!address || !ownerName) {
      if (isUpsert) {
        // FIX 2026-08-05 (bug card Detalle): la card de upload del Detalle
        // manda POST con `localId` y SOLO `documents`. NO trae address porque
        // la propiedad ya existe. Validamos ahora (con localId y sin
        // propertyId declarado todavía) que la propiedad EXISTE; los valores
        // de address/ownerName se re-leen más abajo, después de declarar
        // propertyId + orgId.
        try {
          const [existingRows] = await pool.query<any[]>(
            "SELECT id, organization_id FROM properties WHERE id = ?",
            [localId],
          );
          if (existingRows.length === 0) {
            res.status(404).json({
              error: `No se encontró la propiedad con id=${localId}.`,
              code: "PROPERTY_NOT_FOUND",
            });
            return;
          }
          console.log(
            `[POST /api/properties] doc-only update detectado (localId=${localId}, sin address/ownerName). OK — se re-leen del row existente abajo.`,
          );
          // Marcamos el modo "doc-only" en un flag para que la sección
          // posterior NO requiera estos campos de nuevo.
          if (!address && !ownerName) {
            // (no asignamos nada — los re-leemos más abajo cuando
            //  ya tengamos propertyId y orgId en scope)
          }
        } catch (lookupErr: any) {
          console.error(
            "[POST /api/properties] no se pudo validar la propiedad existente:",
            lookupErr.message,
          );
          res.status(500).json({
            error: "No se pudo validar la propiedad existente.",
            code: "LOOKUP_FAILED",
          });
          return;
        }
      } else {
        // INSERT puro: sin localId y sin address → 400.
        res.status(400).json({
          error: "Faltan campos requeridos: address, ownerName",
          code: "MISSING_REQUIRED_FIELDS",
        });
        return;
      }
    }

    // ── 1. Crear carpeta en Drive SOLO en INSERT (no en UPSERT) ────────
    let driveFolderId: string | null = null;
    let driveFolderPath: string | null = null;
    if (!isUpsert) {
      const drive = await getFreshDriveClient();
      if (drive) {
        try {
          const [tokenRows] = await pool.query<any[]>(
            "SELECT drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?",
            ["default_user", "google_drive"],
          );
          const rootFolderId = tokenRows[0]?.drive_folder_id;

          if (rootFolderId) {
            // BUG-010: usar el helper central de escape. Escapa `\` antes
            // que `'` — el orden importa.
            const safeAddress = escapeDriveQueryValue(address);
            // BUG-016: con withTimeout en las 4 llamadas a Drive.
            const existing = await withTimeout(
              drive.files.list({
                q: `name='${safeAddress}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
                fields: "files(id)",
                spaces: "drive",
              }),
              GOOGLE_API_TIMEOUT_MS,
              "drive.files.list (property folder)",
            );

            let folderId = existing.data.files?.[0]?.id;
            if (!folderId) {
              const created = await withTimeout(
                drive.files.create({
                  requestBody: {
                    name: address,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [rootFolderId],
                  },
                  fields: "id",
                }),
                GOOGLE_API_TIMEOUT_MS,
                "drive.files.create (property folder)",
              );
              folderId = created.data.id!;
            }
            driveFolderId = folderId;
            driveFolderPath = `InmoControl/${address}`;

            const subs = ["Propietario", "Inventarios"];
            for (const sub of subs) {
              const subExisting = await withTimeout(
                drive.files.list({
                  q: `name='${sub}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
                  fields: "files(id)",
                  spaces: "drive",
                }),
                GOOGLE_API_TIMEOUT_MS,
                `drive.files.list (subfolder ${sub})`,
              );
              if (!subExisting.data.files?.length) {
                await withTimeout(
                  drive.files.create({
                    requestBody: {
                      name: sub,
                      mimeType: "application/vnd.google-apps.folder",
                      parents: [folderId],
                    },
                    fields: "id",
                  }),
                  GOOGLE_API_TIMEOUT_MS,
                  `drive.files.create (subfolder ${sub})`,
                );
              }
            }
          }
        } catch (err: any) {
          console.warn(
            "[Drive] Error creando carpeta de propiedad:",
            err.message,
          );
        }
      }
    }

    // ── 2. Resolver propertyId ─────────────────────────────────────────
    const propertyId =
      localId && !String(localId).startsWith("wizard-")
        ? localId
        : crypto.randomUUID();
    const dbStatus = status || "Pendiente";

    // FIX 2026-08-05 (bug card Detalle): si es UPSERT y NO nos mandaron
    // address/ownerName (sub-flujo: card de upload del Detalle), re-leemos
    // los valores del row existente. Sin esto, los INSERTs a tablas
    // relacionadas (property_owners.firstOwnerId lookup, validaciones
    // internas) pueden fallar o insertar NULL donde no deben.
    if (isUpsert && (!address || !ownerName)) {
      try {
        const [existingForFill] = await pool.query<any[]>(
          "SELECT address, owner_name FROM properties WHERE id = ?",
          [propertyId],
        );
        if (existingForFill.length > 0) {
          address = address || existingForFill[0].address;
          ownerName = ownerName || existingForFill[0].owner_name;
          console.log(
            `[POST /api/properties] re-llenado address/ownerName desde row existente: address="${address}", ownerName="${ownerName}"`,
          );
        }
      } catch (fillErr: any) {
        console.warn(
          "[POST /api/properties] no se pudo re-llenar address/ownerName del row:",
          fillErr.message,
        );
      }
    }

    const toMysqlDateTime = (iso: string | null | undefined): string | null => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const pad = (n: number) => String(n).padStart(2, "0");
      return (
        `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
        `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
      );
    };
    const dbMandateSignedAt = toMysqlDateTime(mandateSignedAt);

    // Resolvemos orgId ANTES del try principal porque los loops de owners/units
    // están en try blocks separados más abajo. Si lo declaráramos adentro del
    // try, no sería visible fuera.
    //
    // FIX 2026-07-22: si `ensureDefaultOrg()` tira (ej: tabla `organizations`
    // no existe, schema drift, FK corrupta), el error se propagaba sin ser
    // atrapado y Express devolvía HTML 500 (su default error page) en vez de
    // JSON. Eso hacía que el frontend reciba un body no parseable y el
    // usuario vea "el botón no hace nada". Ahora lo capturamos explícito y
    // devolvemos JSON con el mensaje real.
    let orgId: string;
    try {
      orgId = await ensureDefaultOrg();
    } catch (err: any) {
      console.error(
        "[POST /api/properties] Error resolviendo orgId:",
        err.message,
      );
      res.status(500).json({
        error:
          "Error resolviendo organización por defecto: " +
          (err.message ?? String(err)),
      });
      return;
    }

    try {
      if (isUpsert) {
        // FIX 2026-08-05 (bug UPSERT inventario): el server no actualizaba
        // inventory_captacion_pdf_url ni inventory_colocacion_pdf_url en el
        // UPSERT, por lo que los PDFs subidos a Drive desde el wizard se
        // "perdía" en la UI (la DB quedaba en NULL). Agregamos las 2 columnas
        // con el mismo patron CASE WHEN del mandato, y chequemos
        // affectedRows para no devolver 200 si el WHERE no matcheo.
        const [updateResult] = await pool.query<any>(
          `UPDATE properties SET
           address           = COALESCE(?, address),
           chip              = COALESCE(?, chip),
           folio             = COALESCE(?, folio),
           owner_name        = COALESCE(?, owner_name),
           owner_id_number   = COALESCE(?, owner_id_number),
           owner_phone       = COALESCE(?, owner_phone),
           owner_email       = COALESCE(?, owner_email),
           drive_folder_id   = COALESCE(?, drive_folder_id),
           drive_folder_path = COALESCE(?, drive_folder_path),
           property_type     = COALESCE(?, property_type),
           status            = COALESCE(NULLIF(?, ''), status),
           mandato_pdf_url   = CASE WHEN ? IS NULL OR ? = '' THEN mandato_pdf_url ELSE ? END,
           mandato_signed_at = COALESCE(?, mandato_signed_at),
           inventory_captacion_pdf_url = CASE WHEN ? IS NULL OR ? = '' THEN inventory_captacion_pdf_url ELSE ? END,
           inventory_colocacion_pdf_url = CASE WHEN ? IS NULL OR ? = '' THEN inventory_colocacion_pdf_url ELSE ? END
         WHERE id = ? AND organization_id = ?`,
          [
            address ?? null,
            chip ?? null,
            folio ?? null,
            ownerName ?? null,
            ownerIdNumber ?? null,
            ownerPhone ?? null,
            ownerEmail ?? null,
            driveFolderId,
            driveFolderPath,
            propertyType ?? null,
            dbStatus,
            mandatePdfUrl ?? null,
            mandatePdfUrl ?? null,
            mandatePdfUrl ?? null,
            dbMandateSignedAt,
            inventoryCaptacionPdfUrl ?? null,
            inventoryCaptacionPdfUrl ?? null,
            inventoryCaptacionPdfUrl ?? null,
            inventoryColocacionPdfUrl ?? null,
            inventoryColocacionPdfUrl ?? null,
            inventoryColocacionPdfUrl ?? null,
            propertyId,
            orgId,
          ],
        );
        if ((updateResult as any).affectedRows === 0) {
          console.error(
            "[POST /api/properties] UPSERT no afectó ninguna fila:",
            { propertyId, orgId },
          );
          res.status(500).json({
            error:
              "No se pudo actualizar la propiedad: el id no existe o pertenece a otra organización",
            code: "UPSERT_NO_MATCH",
          });
          return;
        }
      } else {
        // FIX Karpathy (jul-2026): rechaza blob/data URLs en mandato_pdf_url
        // (consistente con el fix 4c6a6e9 que rechazó blob/data en
        // property_documents.file_url).
        if (
          mandatePdfUrl &&
          typeof mandatePdfUrl === "string" &&
          (mandatePdfUrl.startsWith("blob:") ||
            mandatePdfUrl.startsWith("data:"))
        ) {
          return res.status(400).json({
            error:
              "mandato_pdf_url no puede ser un blob/data URL — solo URLs de Drive (https://). Reintentá con Drive conectado.",
          });
        }
        await pool.query(
          `INSERT INTO properties
          (id, organization_id, address, chip, folio, owner_name, owner_id_number, owner_phone, owner_email,
           status, drive_folder_id, drive_folder_path, property_type,
           mandato_pdf_url, mandato_signed_at, inventory_captacion_pdf_url, inventory_colocacion_pdf_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            propertyId,
            orgId,
            address,
            chip || null,
            folio || null,
            ownerName,
            ownerIdNumber || null,
            ownerPhone || null,
            ownerEmail || null,
            dbStatus,
            driveFolderId,
            driveFolderPath,
            propertyType || null,
            mandatePdfUrl ?? null,
            dbMandateSignedAt,
            inventoryCaptacionPdfUrl ?? null,
            inventoryColocacionPdfUrl ?? null,
          ],
        );
      }
    } catch (err: any) {
      console.error("[DB] Error creando propiedad:", err.message);
      res
        .status(500)
        .json({ error: "Error guardando propiedad: " + err.message });
      return;
    }

    // ── 3. Persistir owners (solo si vienen en el body) ────────────────
    // Estrategia: DELETE + INSERT en UPSERT para mantener consistencia con el
    // wizard. Si el frontend NO manda `owners`, no tocamos la tabla (caso de
    // un PATCH puntual que solo quiere cambiar el status, por ejemplo).
    //
    // IMPORTANTE: el DELETE va en ON DELETE CASCADE a property_documents
    // (los docs del owner se borran con él). Si el frontend solo quiere
    // agregar 1 owner nuevo, debe re-enviar TODOS los owners.
    if (Array.isArray(owners)) {
      try {
        // BUG-017: DELETE + INSERT debe ser atómico. Si un INSERT falla a
        // mitad de camino, los anteriores ya commitearon sin la transacción
        // y la propiedad queda con un set parcial. Envolvemos todo en
        // withTransaction: o se aplican TODOS los inserts o NINGUNO.
        await withTransaction(async (conn) => {
          // Capturar el primer owner (si hay) para usarlo como "primer owner" legacy
          // al parsear documentos con keys legacy.
          const ownerIds: string[] = [];
          await conn.query(
            `DELETE FROM property_owners WHERE property_id = ?`,
            [propertyId],
          );
          for (let i = 0; i < owners.length; i++) {
            const o = owners[i] ?? {};
            const ownerId =
              typeof o.id === "string" && o.id && !o.id.startsWith("wizard-")
                ? o.id
                : crypto.randomUUID();
            const name = String(o.name ?? "").trim();
            if (!name) continue; // saltamos owners sin nombre
            const idNumber = o.idNumber ?? o.id_number ?? null;
            const phone = o.phone ?? null;
            const email = o.email ?? null;
            // ownershipPct: aceptar number, string, o null
            let ownershipPct: number | null = null;
            if (
              o.ownershipPct !== undefined &&
              o.ownershipPct !== null &&
              o.ownershipPct !== ""
            ) {
              const n = Number(o.ownershipPct);
              if (!isNaN(n) && n >= 0 && n <= 100) ownershipPct = n;
            }
            const position = Number(o.position) || i + 1;
            await conn.query(
              `INSERT INTO property_owners
              (id, organization_id, property_id, name, id_number, phone, email,
               ownership_pct, position, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                ownerId,
                orgId,
                propertyId,
                name,
                idNumber ? String(idNumber) : null,
                phone ? String(phone) : null,
                email ? String(email) : null,
                ownershipPct,
                position,
                o.notes ?? null,
              ],
            );
            ownerIds.push(ownerId);
          }
          // Si el frontend mandó owners[] vacío, NO borramos el legacy `owner_name`
          // (compat: lo seteamos arriba). Pero si explícitamente mandó `owners`
          // y quedó vacío, el sistema de legacy queda sin primer owner — eso es
          // decisión del usuario (probablemente quiere resetear).
        });
      } catch (err: any) {
        console.error("[DB] Error persistiendo property_owners:", err.message);
        // BUG-017: antes silenciábamos. Ahora devolvemos 500 para que el
        // cliente sepa que la operación falló y pueda reintentar. La
        // transacción ya hizo rollback, así que la propiedad queda con
        // los owners VIEJOS intactos.
        res.status(500).json({
          error: "Error guardando owners. Cambios no aplicados.",
          hint: "Reintentá el POST con el mismo body.",
        });
        return;
      }
    }

    // ── 4. Persistir units (estrategia idéntica: DELETE + INSERT) ──────
    if (Array.isArray(units)) {
      try {
        // BUG-017: misma lógica que owners — DELETE + INSERT en una sola
        // transacción para evitar set parcial si un INSERT falla.
        await withTransaction(async (conn) => {
          await conn.query(`DELETE FROM property_units WHERE property_id = ?`, [
            propertyId,
          ]);
          for (let i = 0; i < units.length; i++) {
            const u = units[i] ?? {};
            const type = String(u.type ?? "").trim();
            if (!UNIT_TYPES.has(type)) {
              console.warn(
                `[units] tipo inválido "${type}" — se salta. Permitidos: ${[...UNIT_TYPES].join(", ")}`,
              );
              continue;
            }
            const label = String(u.label ?? "").trim();
            if (!label) continue; // sin label no se puede mostrar
            const unitId =
              typeof u.id === "string" && u.id && !u.id.startsWith("wizard-")
                ? u.id
                : crypto.randomUUID();
            const folioMatricula =
              u.folioMatricula ?? u.folio_matricula ?? null;
            const areaM2 = u.areaM2 ?? u.area_m2 ?? null;
            const position = Number(u.position) || i + 1;
            await conn.query(
              `INSERT INTO property_units
              (id, organization_id, property_id, type, label, folio_matricula,
               area_m2, notes, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                unitId,
                orgId,
                propertyId,
                type,
                label,
                folioMatricula ? String(folioMatricula) : null,
                areaM2 !== null && areaM2 !== "" ? Number(areaM2) : null,
                u.notes ?? null,
                position,
              ],
            );
          }
        });
      } catch (err: any) {
        console.error("[DB] Error persistiendo property_units:", err.message);
        // BUG-017: 500 con hint accionable (mismo patrón que owners).
        res.status(500).json({
          error: "Error guardando units. Cambios no aplicados.",
          hint: "Reintentá el POST con el mismo body.",
        });
        return;
      }
    }

    // ── 5. Persistir documents (con vínculo a owner_id / unit_id) ──────
    // Para resolver keys legacy ("Cédula de Ciudadanía") necesitamos el id
    // del primer owner. Lo leemos de la BD si acabamos de insertarlo, o de
    // la fila legacy si no se mandó `owners`.
    let firstOwnerId: string | null = null;
    try {
      const [po] = await pool.query<any[]>(
        `SELECT id FROM property_owners WHERE property_id = ? ORDER BY position ASC LIMIT 1`,
        [propertyId],
      );
      firstOwnerId = po[0]?.id ?? null;
    } catch {
      /* noop */
    }

    if (documents && typeof documents === "object") {
      for (const [key, url] of Object.entries(documents)) {
        if (typeof url !== "string" || !url) continue;
        // FIX AC-15 (jul-2026): nunca persistir `blob:` ni `data:` URLs.
        // Son locales al browser y expiran al cerrar la pestaña/refresh.
        // Si el cliente las manda, las rechazamos silenciosamente (con log)
        // para que el bug histórico no se repita en filas zombie.
        if (url.startsWith("blob:") || url.startsWith("data:")) {
          console.warn(
            `[docs] rechazando "${key}" — URL local (${url.slice(0, 40)}...) no se persiste en MySQL. El cliente debe re-subir cuando Drive esté conectado.`,
          );
          continue;
        }
        const parsed = parseDocumentKey(key, firstOwnerId);
        if (!parsed) continue; // key no reconocida → la salteamos
        // Si parsed.ownerId es del wizard (wizard-X), no lo podemos persistir
        // (FK explota). Lo saltamos — el frontend debe reenviar tras el UPSERT.
        if (parsed.ownerId && String(parsed.ownerId).startsWith("wizard-")) {
          console.warn(`[docs] se salta "${key}" — ownerId es wizard-temp`);
          continue;
        }
        if (parsed.unitId && String(parsed.unitId).startsWith("wizard-")) {
          console.warn(`[docs] se salta "${key}" — unitId es wizard-temp`);
          continue;
        }
        try {
          await pool.query(
            `INSERT INTO property_documents
            (id, property_id, owner_id, unit_id, doc_type, file_name, file_url, file_size, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             owner_id   = VALUES(owner_id),
             unit_id    = VALUES(unit_id),
             file_url   = VALUES(file_url),
             file_name  = VALUES(file_name),
             uploaded_at = CURRENT_TIMESTAMP`,
            [
              crypto.randomUUID(),
              propertyId,
              parsed.ownerId,
              parsed.unitId,
              parsed.docType,
              `${key}.pdf`,
              url,
              null,
              "default_user",
            ],
          );
        } catch (err: any) {
          console.warn(
            `[DB] No se pudo persistir property_document (${key}):`,
            err.message,
          );
        }
      }
    }

    // ── 6. En UPSERT devolvemos el folder Drive existente si está null ──
    let responseDriveFolderId = driveFolderId;
    let responseDriveFolderPath = driveFolderPath;
    if (isUpsert && (!responseDriveFolderId || !responseDriveFolderPath)) {
      const [existing] = await pool.query<any[]>(
        "SELECT drive_folder_id, drive_folder_path FROM properties WHERE id = ?",
        [propertyId],
      );
      if (existing.length) {
        responseDriveFolderId =
          responseDriveFolderId ?? existing[0].drive_folder_id;
        responseDriveFolderPath =
          responseDriveFolderPath ?? existing[0].drive_folder_path;
      }
    }

    console.log(
      "[POST /api/properties] OK — id:",
      propertyId,
      "drive:",
      responseDriveFolderPath ?? "(sin Drive)",
    );
    res.json({
      success: true,
      propertyId,
      driveFolderId: responseDriveFolderId,
      driveFolderPath: responseDriveFolderPath,
      message: responseDriveFolderId
        ? "Propiedad guardada en MySQL y Drive"
        : "Propiedad guardada en MySQL (sin Drive — conecta tu Google Drive)",
    });
  } catch (err: any) {
    // Cualquier error no manejado por los try/catch internos cae acá.
    // Devolvemos JSON para que el frontend pueda parsearlo (antes era HTML
    // y el browser tiraba SyntaxError en consola).
    console.error("[POST /api/properties] UNHANDLED:", err.message ?? err);
    if (err?.stack) console.error(err.stack);
    if (!res.headersSent) {
      res.status(500).json({
        error:
          "Error inesperado guardando propiedad: " +
          (err.message ?? String(err)),
      });
    }
  }
});

/**
 * GET /api/properties/:id
 * Devuelve una propiedad puntual con inventory_count, documents, owners y units.
 * Los owners y units vienen con sus documentos anidados (cedula/rut por owner,
 * certificado_tradicion por unit). El Mandato vive aparte en `mandate_pdf_url`.
 */
router.get("/:id", async (req, res) => {
  try {
    const propertyId = req.params.id;
    const orgId = await ensureDefaultOrg();
    const [rows] = await pool.query<any[]>(
      `SELECT p.id, p.address, p.chip, p.folio, p.owner_name, p.owner_id_number, p.owner_phone, p.owner_email,
              p.status, p.property_type, p.drive_folder_id, p.drive_folder_path,
              p.inventory_pdf_url, p.inventory_captacion_pdf_url, p.inventory_colocacion_pdf_url,
              p.mandato_pdf_url, p.mandato_signed_at, p.created_at,
              COALESCE((SELECT COUNT(*) FROM inventories i WHERE i.property_id = p.id), 0) AS inventory_count
       FROM properties p
       WHERE p.id = ? AND p.organization_id = ?
       LIMIT 1`,
      [propertyId, orgId],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    const p = rows[0];

    // Owners (con sus docs)
    const [ownerRows] = await pool.query<any[]>(
      `SELECT id, name, id_number, phone, email, ownership_pct, position, notes
       FROM property_owners
       WHERE property_id = ?
       ORDER BY position ASC`,
      [propertyId],
    );
    const ownerIds = ownerRows.map((o) => o.id);
    const docsByOwner: Record<string, { cedula?: string; rut?: string }> = {};
    if (ownerIds.length > 0) {
      const [docRows] = await pool.query<any[]>(
        `SELECT owner_id, doc_type, file_url
         FROM property_documents
         WHERE property_id = ? AND owner_id IN (${ownerIds.map(() => "?").join(",")})`,
        [propertyId, ...ownerIds],
      );
      for (const d of docRows) {
        if (!d.owner_id) continue;
        if (!docsByOwner[d.owner_id]) docsByOwner[d.owner_id] = {};
        if (d.doc_type === "cedula" || d.doc_type === "rut") {
          docsByOwner[d.owner_id][d.doc_type] = d.file_url;
        }
      }
    }
    const owners = ownerRows.map((o) => ({
      id: o.id,
      name: o.name,
      idNumber: o.id_number,
      phone: o.phone,
      email: o.email,
      ownershipPct: o.ownership_pct !== null ? Number(o.ownership_pct) : null,
      position: o.position,
      notes: o.notes,
      documents: docsByOwner[o.id] ?? {},
    }));

    // Units (con sus docs)
    const [unitRows] = await pool.query<any[]>(
      `SELECT id, type, label, folio_matricula, area_m2, notes, position
       FROM property_units
       WHERE property_id = ?
       ORDER BY position ASC`,
      [propertyId],
    );
    const unitIds = unitRows.map((u) => u.id);
    const docsByUnit: Record<string, { certificado_tradicion?: string }> = {};
    if (unitIds.length > 0) {
      const [docRows] = await pool.query<any[]>(
        `SELECT unit_id, doc_type, file_url
         FROM property_documents
         WHERE property_id = ? AND unit_id IN (${unitIds.map(() => "?").join(",")})`,
        [propertyId, ...unitIds],
      );
      for (const d of docRows) {
        if (!d.unit_id) continue;
        if (!docsByUnit[d.unit_id]) docsByUnit[d.unit_id] = {};
        if (d.doc_type === "certificado_tradicion") {
          docsByUnit[d.unit_id].certificado_tradicion = d.file_url;
        }
      }
    }
    const units = unitRows.map((u) => ({
      id: u.id,
      type: u.type,
      label: u.label,
      folioMatricula: u.folio_matricula,
      areaM2: u.area_m2 !== null ? Number(u.area_m2) : null,
      notes: u.notes,
      position: u.position,
      documents: docsByUnit[u.id] ?? {},
    }));

    // Documents a nivel de propiedad: predial + certificado_tradicion principal (unit_id IS NULL)
    const [propDocRows] = await pool.query<any[]>(
      `SELECT doc_type, file_url
       FROM property_documents
       WHERE property_id = ? AND owner_id IS NULL AND unit_id IS NULL`,
      [propertyId],
    );
    const propertyDocuments: Record<string, string> = {};
    for (const d of propDocRows) {
      if (d.doc_type === "predial" || d.doc_type === "certificado_tradicion") {
        propertyDocuments[d.doc_type] = d.file_url;
      }
    }

    // Mantener compat: `documents` legacy con keys legibles que apuntan al
    // primer owner (CC, RUT) y a la unidad principal (Certificado de Tradición).
    // Esto evita que la card de la lista de propiedades muestre "todo falta"
    // aunque los docs estén subidos.
    const firstOwner = owners[0];
    const documentsLegacy: Record<string, string> = {
      "Cédula de Ciudadanía": firstOwner?.documents?.cedula ?? "",
      "Rut Actualizado": firstOwner?.documents?.rut ?? "",
      "Impuesto Predial": propertyDocuments.predial ?? "",
      "Certificado de Tradición": propertyDocuments.certificado_tradicion ?? "",
    };
    // Quitar entries vacías
    for (const k of Object.keys(documentsLegacy)) {
      if (!documentsLegacy[k]) delete documentsLegacy[k];
    }

    res.json({
      id: p.id,
      address: p.address,
      chip: p.chip,
      folio: p.folio,
      owner_name: p.owner_name,
      owner_id_number: p.owner_id_number,
      owner_phone: p.owner_phone,
      owner_email: p.owner_email,
      status: p.status,
      property_type: p.property_type,
      drive_folder_id: p.drive_folder_id,
      drive_folder_path: p.drive_folder_path,
      inventory_pdf_url: p.inventory_pdf_url,
      inventario_captacion_pdf_url: p.inventory_captacion_pdf_url,
      inventario_colocacion_pdf_url: p.inventory_colocacion_pdf_url,
      inventory_captacion_pdf_url: p.inventory_captacion_pdf_url,
      inventory_colocacion_pdf_url: p.inventory_colocacion_pdf_url,
      mandato_pdf_url: p.mandato_pdf_url,
      mandate_pdf_url: p.mandato_pdf_url,
      mandate_signed_at: p.mandato_signed_at,
      created_at: p.created_at,
      inventory_count: p.inventory_count,
      // ── Estructura nueva (migración 010+) ──
      owners,
      units,
      documents: propertyDocuments,
      // ── Compat con frontend legacy ──
      documents_legacy: documentsLegacy,
    });
  } catch (err: any) {
    console.error("[GET /api/properties/:id]", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/properties
 * Lista propiedades de la org. Por defecto, devuelve owners y units SIN sus
 * documentos anidados (para no inflar la lista). Si `?expand=full`, devuelve
 * también los docs (más pesado).
 */
router.get("/", async (req, res) => {
  try {
    const expand = req.query.expand === "full";
    const orgId = await ensureDefaultOrg();
    const [rows] = await pool.query<any[]>(
      `SELECT p.id, p.address, p.chip, p.folio, p.owner_name, p.owner_id_number, p.owner_phone, p.owner_email,
              p.status, p.property_type, p.drive_folder_id, p.drive_folder_path,
              p.inventory_pdf_url, p.mandato_pdf_url, p.mandato_signed_at, p.created_at,
              COALESCE((SELECT COUNT(*) FROM inventories i WHERE i.property_id = p.id), 0) AS inventory_count
       FROM properties p
       WHERE p.organization_id = ? AND p.archived = 0
       ORDER BY p.created_at DESC`,
      [orgId],
    );

    const propertyIds = rows.map((r) => r.id);
    if (propertyIds.length === 0) {
      res.json({ properties: [] });
      return;
    }

    // Owners (sin docs anidados por defecto)
    const [ownerRows] = await pool.query<any[]>(
      `SELECT id, property_id, name, id_number, phone, email, ownership_pct, position
       FROM property_owners
       WHERE property_id IN (${propertyIds.map(() => "?").join(",")})
       ORDER BY position ASC`,
      propertyIds,
    );
    const ownersByProperty: Record<string, any[]> = {};
    for (const o of ownerRows) {
      if (!ownersByProperty[o.property_id])
        ownersByProperty[o.property_id] = [];
      ownersByProperty[o.property_id].push({
        id: o.id,
        name: o.name,
        idNumber: o.id_number,
        phone: o.phone,
        email: o.email,
        ownershipPct: o.ownership_pct !== null ? Number(o.ownership_pct) : null,
        position: o.position,
      });
    }

    // Units
    const [unitRows] = await pool.query<any[]>(
      `SELECT id, property_id, type, label, folio_matricula, area_m2, position
       FROM property_units
       WHERE property_id IN (${propertyIds.map(() => "?").join(",")})
       ORDER BY position ASC`,
      propertyIds,
    );
    const unitsByProperty: Record<string, any[]> = {};
    for (const u of unitRows) {
      if (!unitsByProperty[u.property_id]) unitsByProperty[u.property_id] = [];
      unitsByProperty[u.property_id].push({
        id: u.id,
        type: u.type,
        label: u.label,
        folioMatricula: u.folio_matricula,
        areaM2: u.area_m2 !== null ? Number(u.area_m2) : null,
        position: u.position,
      });
    }

    // Documents (legacy compat + nivel de propiedad)
    const [docRows] = await pool.query<any[]>(
      `SELECT property_id, doc_type, file_url
       FROM property_documents
       WHERE property_id IN (${propertyIds.map(() => "?").join(",")})`,
      propertyIds,
    );
    const docsByProperty: Record<string, Record<string, string>> = {};
    for (const d of docRows) {
      if (!docsByProperty[d.property_id]) docsByProperty[d.property_id] = {};
      if (d.doc_type === "cedula")
        docsByProperty[d.property_id]["Cédula de Ciudadanía"] = d.file_url;
      else if (d.doc_type === "rut")
        docsByProperty[d.property_id]["Rut Actualizado"] = d.file_url;
      else if (d.doc_type === "predial")
        docsByProperty[d.property_id]["Impuesto Predial"] = d.file_url;
      else if (d.doc_type === "certificado_tradicion")
        docsByProperty[d.property_id]["Certificado de Tradición"] = d.file_url;
    }

    const properties = rows.map((r) => ({
      ...r,
      documents: docsByProperty[r.id] ?? {},
      mandatePdfUrl: r.mandato_pdf_url,
      mandateSignedAt: r.mandato_signed_at,
      driveFolderId: r.drive_folder_id,
      driveFolderPath: r.drive_folder_path,
      propertyType: r.property_type,
      ownerIdNumber: r.owner_id_number,
      // Migración 010+
      owners: ownersByProperty[r.id] ?? [],
      units: unitsByProperty[r.id] ?? [],
    }));

    res.json({ properties });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/properties/:id
 * No tocar owners/units (esos se manejan vía POST). Solo campos escalares
 * de `properties` y documentos sueltos si vienen.
 */
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const allowed = [
    "address",
    "chip",
    "folio",
    "owner_name",
    "owner_id_number",
    "owner_phone",
    "owner_email",
    "status",
    "property_type",
    "mandato_pdf_url",
    "mandato_signed_at",
    "drive_folder_id",
    "drive_folder_path",
    "inventory_pdf_url",
  ];
  const updates: string[] = [];
  const values: any[] = [];

  const toMysqlDateTime = (v: any): string | null => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v !== "string") return null;
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace("T", " ");
  };

  const fieldAliases: Record<string, string[]> = {
    mandato_pdf_url: ["mandato_pdf_url", "mandatoPdfUrl", "mandatePdfUrl"],
    mandato_signed_at: [
      "mandato_signed_at",
      "mandatoSignedAt",
      "mandateSignedAt",
    ],
    drive_folder_id: ["drive_folder_id", "driveFolderId"],
    drive_folder_path: ["drive_folder_path", "driveFolderPath"],
    inventory_pdf_url: ["inventory_pdf_url", "inventoryPdfUrl"],
    property_type: ["property_type", "propertyType"],
    owner_name: ["owner_name", "ownerName"],
    owner_id_number: ["owner_id_number", "ownerIdNumber"],
    owner_phone: ["owner_phone", "ownerPhone"],
    owner_email: ["owner_email", "ownerEmail"],
  };

  for (const f of allowed) {
    const keys = fieldAliases[f] ?? [
      f,
      f.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
    ];
    let value: any;
    for (const k of keys) {
      if (req.body[k] !== undefined) {
        value = req.body[k];
        break;
      }
    }
    if (value !== undefined) {
      if (f === "mandato_signed_at") {
        value = toMysqlDateTime(value);
      }
      updates.push(`${f} = ?`);
      values.push(value);
    }
  }

  if (!updates.length) {
    res.json({ success: true, message: "Nothing to update" });
    return;
  }
  // FIX Karpathy (jul-2026): rechaza blob/data URLs en mandato_pdf_url
  // (consistente con el fix 4c6a6e9 que rechazó blob/data en
  // property_documents.file_url). El mandato es la columna paralela
  // a file_url y tenía el mismo bug: el cliente persistía blob URLs
  // locales que morían al refrescar el browser.
  for (let i = 0; i < updates.length; i++) {
    if (updates[i].startsWith("mandato_pdf_url = ?")) {
      const v = values[i];
      if (
        typeof v === "string" &&
        (v.startsWith("blob:") || v.startsWith("data:"))
      ) {
        return res.status(400).json({
          error:
            "mandato_pdf_url no puede ser un blob/data URL — solo URLs de Drive (https://). Reintentá desde el Detalle del Inmueble con Drive conectado.",
        });
      }
    }
  }

  values.push(id);
  try {
    const orgId = await ensureDefaultOrg();
    // BUG-018: pre-check para distinguir "no existe" (404) de "existe pero
    // valores idénticos" (200 no-op). Sin este check, affectedRows=0
    // podía significar ambas cosas y siempre devolvía 200 mentiroso.
    const [exists] = await pool.query<any[]>(
      `SELECT 1 FROM properties WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, orgId],
    );
    if (!exists.length) {
      return res.status(404).json({
        error: "Propiedad no encontrada o no pertenece a esta organización",
      });
    }
    await pool.query(
      `UPDATE properties SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
      [...values, orgId],
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/properties/:id
 * Solo permite eliminar una propiedad si NO tiene inventarios asociados.
 * Con CASCADE, los `property_documents`, `property_owners` y `property_units`
 * se limpian automáticamente.
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const orgId = await ensureDefaultOrg();

  const [propRows] = await pool.query<any[]>(
    `SELECT id, address, drive_folder_id
     FROM properties
     WHERE id = ? AND organization_id = ?`,
    [id, orgId],
  );

  if (!propRows.length) {
    res.status(404).json({ error: "Propiedad no encontrada" });
    return;
  }

  const [invRows] = await pool.query<any[]>(
    `SELECT id, phase FROM inventories WHERE property_id = ? LIMIT 1`,
    [id],
  );

  if (invRows.length > 0) {
    res.status(409).json({
      error:
        "No se puede eliminar: este inmueble ya tiene inventario(s) asociado(s). Los inventarios son trazabilidad legal y no se pueden deshacer.",
      hasInventories: true,
      inventoryPhase: invRows[0].phase,
    });
    return;
  }

  const property = propRows[0];

  try {
    await pool.query(
      `DELETE FROM properties WHERE id = ? AND organization_id = ?`,
      [id, orgId],
    );
  } catch (err: any) {
    console.error("[DELETE /api/properties] MySQL error:", err.message);
    res
      .status(500)
      .json({ error: "Error eliminando propiedad: " + err.message });
    return;
  }

  let driveCleanupStatus: "skipped" | "deleted" | "failed" = "skipped";
  if (property.drive_folder_id) {
    try {
      const drive = await getFreshDriveClient();
      if (drive) {
        const children = await drive.files.list({
          q: `'${property.drive_folder_id}' in parents and trashed=false`,
          fields: "files(id)",
          spaces: "drive",
        });
        const childCount = children.data.files?.length ?? 0;
        if (childCount === 0) {
          await drive.files.update({
            fileId: property.drive_folder_id,
            requestBody: { trashed: true },
          });
          driveCleanupStatus = "deleted";
        } else {
          driveCleanupStatus = "skipped";
        }
      }
    } catch (err: any) {
      console.warn(
        "[DELETE /api/properties] Drive cleanup error:",
        err.message,
      );
      driveCleanupStatus = "failed";
    }
  }

  console.log(
    `[DELETE /api/properties] OK — id: ${id}, drive: ${driveCleanupStatus}`,
  );
  res.json({
    success: true,
    driveCleanupStatus,
    message:
      driveCleanupStatus === "deleted"
        ? "Propiedad eliminada y carpeta Drive vaciada"
        : driveCleanupStatus === "skipped"
          ? "Propiedad eliminada (la carpeta Drive tenía archivos; queda como histórico)"
          : "Propiedad eliminada (no se pudo limpiar Drive, hacelo manual si querés)",
  });
});

export default router;
