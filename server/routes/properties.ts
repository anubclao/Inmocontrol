import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import express from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import pool from '../db.js';
import { isTokenExpiringSoon } from '../lib/googleAuth.js';

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

async function getFreshDriveClient() {
  const [rows] = await pool.query<any[]>(
    'SELECT access_token, refresh_token, expiry_date, drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
    ['default_user', 'google_drive'],
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
      'UPDATE user_oauth_tokens SET access_token=?, expiry_date=? WHERE user_id=? AND provider=?',
      [credentials.access_token, credentials.expiry_date, 'default_user', 'google_drive'],
    );
  }
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/** Mapea la etiqueta legible del documento al doc_type del CHECK constraint de property_documents. */
const DOC_TYPE_MAP: Record<string, string> = {
  'Cédula de Ciudadanía': 'cedula',
  'Certificado de Tradición': 'certificado_tradicion',
  'Impuesto Predial': 'predial',
  'Rut Actualizado': 'rut',
  // 'Contrato de Mandato' vive en properties.mandato_pdf_url, no en property_documents.
};

/**
 * POST /api/properties
 * Crea (o actualiza via UPSERT) una propiedad en MySQL y su carpeta en Drive.
 * Es idempotente: si el `localId` es un id real (no wizard-*), hace UPDATE.
 * Body: { localId?, address, chip, folio, ownerName, ownerIdNumber, ownerPhone?, ownerEmail?,
 *         propertyType?, mandatePdfUrl?, mandateSignedAt?, status?,
 *         documents?: { [label]: url } }
 */
router.post('/', async (req, res) => {
  console.log('[POST /api/properties] body:', {
    address: req.body.address, owner: req.body.ownerName, localId: req.body.localId,
    hasMandate: !!req.body.mandatePdfUrl, docsCount: req.body.documents ? Object.keys(req.body.documents).length : 0,
  });
  const {
    localId, address, chip, folio, ownerName, ownerIdNumber, ownerPhone, ownerEmail,
    propertyType, mandatePdfUrl, mandateSignedAt, status,
    documents,
  } = req.body as Record<string, any>;

  // Validación: address + ownerName son requeridos solo en INSERT (sin localId real).
  // Si viene un localId real, es UPSERT parcial — los faltantes se conservan.
  const isUpsert = !!(localId && !String(localId).startsWith('wizard-'));
  if (!isUpsert && (!address || !ownerName)) {
    res.status(400).json({ error: 'Faltan campos requeridos: address, ownerName' });
    return;
  }

  // 1. Crear carpeta en Drive SOLO en INSERT (no en UPSERT). En re-POSTs la carpeta
  //    ya existe del POST original — re-crearla con nombre 'undefined' sería un bug.
  let driveFolderId: string | null = null;
  let driveFolderPath: string | null = null;
  if (!isUpsert) {
    const drive = await getFreshDriveClient();
    if (drive) {
      try {
        const [tokenRows] = await pool.query<any[]>(
          'SELECT drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
          ['default_user', 'google_drive'],
        );
        const rootFolderId = tokenRows[0]?.drive_folder_id;

        if (rootFolderId) {
          // Buscar carpeta existente con este address (la usamos si ya existe)
          const existing = await drive.files.list({
            q: `name='${String(address).replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            spaces: 'drive',
          });

          let folderId = existing.data.files?.[0]?.id;
          if (!folderId) {
            const created = await drive.files.create({
              requestBody: {
                name: address,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [rootFolderId],
              },
              fields: 'id',
            });
            folderId = created.data.id!;
          }
          driveFolderId = folderId;
          driveFolderPath = `InmoControl/${address}`;

          // Subcarpetas Propietario/Inventarios
          const subs = ['Propietario', 'Inventarios'];
          for (const sub of subs) {
            const subExisting = await drive.files.list({
              q: `name='${sub}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
              fields: 'files(id)',
              spaces: 'drive',
            });
            if (!subExisting.data.files?.length) {
              await drive.files.create({
                requestBody: {
                  name: sub,
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: [folderId],
                },
                fields: 'id',
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('[Drive] Error creando carpeta de propiedad:', err.message);
      }
    }
  }

  // 2. Resolver propertyId. Si viene un localId real (no wizard-*), es UPSERT sobre ese id.
  //    Si no, generamos UUID nuevo.
  const propertyId = localId && !String(localId).startsWith('wizard-') ? localId : crypto.randomUUID();

  // status: si viene en el body, lo usamos; si no, default 'Pendiente'.
  // IMPORTANTE: el CHECK constraint `properties_chk_1` exige español
  // ('Pendiente'|'Activo'|'Arrendado'|'Inactivo'). Si dejamos el default en
  // inglés ('available'), cualquier INSERT sin status explícito rompe con
  // "Check constraint 'properties_chk_1' is violated".
  const dbStatus = status || 'Pendiente';

  // Convierte ISO 8601 → MySQL DATETIME (YYYY-MM-DD HH:MM:SS). Si llega null/undefined,
  // pasa null para que COALESCE lo respete. MySQL NO acepta el sufijo 'Z' directamente.
  const toMysqlDateTime = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
           `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };
  const dbMandateSignedAt = toMysqlDateTime(mandateSignedAt);

  try {
    if (isUpsert) {
      // Re-POST: solo UPDATE parcial. COALESCE en cada campo → los undefined / null / ''
      // conservan el valor previo en BD. El cliente envía únicamente lo que cambió
      // (mandatePdfUrl, mandateSignedAt, documents, etc.).
      await pool.query(
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
           -- Mandato: si llega string no vacío, lo pisamos. Si llega '' o null, conservamos.
           mandato_pdf_url   = CASE WHEN ? IS NULL OR ? = '' THEN mandato_pdf_url ELSE ? END,
           mandato_signed_at = COALESCE(?, mandato_signed_at)
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
          // CASE WHEN: 3 params (test-null, test-empty, valor-real)
          mandatePdfUrl ?? null,
          mandatePdfUrl ?? null,
          mandatePdfUrl ?? null,
          dbMandateSignedAt,
          propertyId,
          'default_org',
        ],
      );
    } else {
      // INSERT inicial: address + ownerName son required.
      await pool.query(
        `INSERT INTO properties
          (id, organization_id, address, chip, folio, owner_name, owner_id_number, owner_phone, owner_email,
           status, drive_folder_id, drive_folder_path, property_type,
           mandato_pdf_url, mandato_signed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          propertyId,
          'default_org',
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
        ],
      );
    }
  } catch (err: any) {
    console.error('[DB] Error creando propiedad:', err.message);
    res.status(500).json({ error: 'Error guardando propiedad: ' + err.message });
    return;
  }

  // 3. Si llegaron `documents`, sincronizar property_documents (INSERT IGNORE por label).
  //    Solo persisto los docs cuyo label tiene un doc_type válido (no 'Contrato de Mandato',
  //    que vive en properties.mandato_pdf_url).
  if (documents && typeof documents === 'object') {
    for (const [label, url] of Object.entries(documents)) {
      const docType = DOC_TYPE_MAP[label];
      if (!docType || typeof url !== 'string' || !url) continue;
      try {
        await pool.query(
          `INSERT INTO property_documents
            (id, property_id, doc_type, file_name, file_url, file_size, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             file_url = VALUES(file_url),
             file_name = VALUES(file_name),
             uploaded_at = CURRENT_TIMESTAMP`,
          [
            crypto.randomUUID(),
            propertyId,
            docType,
            `${label}.pdf`,
            url,
            null,
            'default_user',
          ],
        );
      } catch (err: any) {
        console.warn(`[DB] No se pudo persistir property_document (${label}):`, err.message);
      }
    }
  }

  // En UPSERT devolvemos el folder Drive existente (recuperado de BD) en lugar de null.
  let responseDriveFolderId = driveFolderId;
  let responseDriveFolderPath = driveFolderPath;
  if (isUpsert && (!responseDriveFolderId || !responseDriveFolderPath)) {
    const [existing] = await pool.query<any[]>(
      'SELECT drive_folder_id, drive_folder_path FROM properties WHERE id = ?',
      [propertyId],
    );
    if (existing.length) {
      responseDriveFolderId = responseDriveFolderId ?? existing[0].drive_folder_id;
      responseDriveFolderPath = responseDriveFolderPath ?? existing[0].drive_folder_path;
    }
  }

  console.log('[POST /api/properties] OK — id:', propertyId, 'drive:', responseDriveFolderPath ?? '(sin Drive)');
  res.json({
    success: true,
    propertyId,
    driveFolderId: responseDriveFolderId,
    driveFolderPath: responseDriveFolderPath,
    message: responseDriveFolderId
      ? 'Propiedad guardada en MySQL y Drive'
      : 'Propiedad guardada en MySQL (sin Drive — conecta tu Google Drive)',
  });
});

/**
 * GET /api/properties/:id
 * Devuelve una propiedad puntual con inventory_count y documents.
 * Usado por el wizard al finalizar para refrescar el inventoryCount local.
 */
router.get('/:id', async (req, res) => {
  try {
    const propertyId = req.params.id;
    const [rows] = await pool.query<any[]>(
      `SELECT p.id, p.address, p.chip, p.folio, p.owner_name, p.owner_id_number, p.owner_phone, p.owner_email,
              p.status, p.property_type, p.drive_folder_id, p.drive_folder_path,
              p.inventory_pdf_url, p.inventory_captacion_pdf_url, p.inventory_colocacion_pdf_url,
              p.mandato_pdf_url, p.mandato_signed_at, p.created_at,
              COALESCE((SELECT COUNT(*) FROM inventories i WHERE i.property_id = p.id), 0) AS inventory_count
       FROM properties p
       WHERE p.id = ? AND p.organization_id = ?
       LIMIT 1`,
      [propertyId, 'default_org'],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Propiedad no encontrada' });
      return;
    }
    const p = rows[0];

    // Cargar documentos
    const [docs] = await pool.query<any[]>(
      `SELECT doc_type, file_url FROM property_documents WHERE property_id = ?`,
      [propertyId],
    );
    const documents: Record<string, string> = {};
    const DOC_LABEL: Record<string, string> = {
      cedula: 'Cédula de Ciudadanía',
      certificado_tradicion: 'Certificado de Tradición',
      predial: 'Impuesto Predial',
      rut: 'Rut Actualizado',
      otro: 'Contrato de Mandato',
    };
    for (const d of docs) {
      const label = DOC_LABEL[d.doc_type];
      if (label) documents[label] = d.file_url;
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
      documents,
    });
  } catch (err: any) {
    console.error('[GET /api/properties/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/properties
 * Lista propiedades de la organización, con conteo de inventarios asociados.
 * El `inventory_count` se usa en el cliente para habilitar/deshabilitar la opción de eliminar.
 */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT p.id, p.address, p.chip, p.folio, p.owner_name, p.owner_id_number, p.owner_phone, p.owner_email,
              p.status, p.property_type, p.drive_folder_id, p.drive_folder_path,
              p.inventory_pdf_url, p.mandato_pdf_url, p.mandato_signed_at, p.created_at,
              COALESCE((SELECT COUNT(*) FROM inventories i WHERE i.property_id = p.id), 0) AS inventory_count
       FROM properties p
       WHERE p.organization_id = ? AND p.archived = 0
       ORDER BY p.created_at DESC`,
      ['default_org'],
    );

    // Traer también los documentos legales asociados (cedula, certificado, predial, rut)
    // y agruparlos por propiedad en un mapa {label: url} que entienda el frontend.
    const propertyIds = rows.map((r) => r.id);
    let docsByProperty: Record<string, Record<string, string>> = {};
    if (propertyIds.length > 0) {
      const [docRows] = await pool.query<any[]>(
        `SELECT property_id, doc_type, file_url
         FROM property_documents
         WHERE property_id IN (${propertyIds.map(() => '?').join(',')})`,
        propertyIds,
      );
      const DOC_LABEL_BY_TYPE: Record<string, string> = {
        cedula: 'Cédula de Ciudadanía',
        certificado_tradicion: 'Certificado de Tradición',
        predial: 'Impuesto Predial',
        rut: 'Rut Actualizado',
      };
      for (const d of docRows) {
        const label = DOC_LABEL_BY_TYPE[d.doc_type];
        if (!label) continue;
        if (!docsByProperty[d.property_id]) docsByProperty[d.property_id] = {};
        docsByProperty[d.property_id][label] = d.file_url;
      }
    }

    // Adjuntar `documents` a cada propiedad. Devolvemos snake_case + camelCase aliases
    // porque el frontend a veces usa uno y a veces otro (legacy del refactor).
    const properties = rows.map((r) => ({
      ...r,
      documents: docsByProperty[r.id] ?? {},
      mandatePdfUrl: r.mandato_pdf_url,
      mandateSignedAt: r.mandato_signed_at,
      driveFolderId: r.drive_folder_id,
      driveFolderPath: r.drive_folder_path,
      propertyType: r.property_type,
      ownerIdNumber: r.owner_id_number,
    }));

    res.json({ properties });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/properties/:id
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['address', 'chip', 'folio', 'owner_name', 'owner_id_number', 'owner_phone', 'owner_email', 'status', 'property_type', 'mandato_pdf_url', 'mandato_signed_at', 'drive_folder_id', 'drive_folder_path', 'inventory_pdf_url'];
  const updates: string[] = [];
  const values: any[] = [];
  const map: Record<string, string> = {
    ownerName: 'owner_name',
    ownerIdNumber: 'owner_id_number',
    ownerPhone: 'owner_phone',
    ownerEmail: 'owner_email',
    propertyType: 'property_type',
    mandatePdfUrl: 'mandato_pdf_url',
    mandateSignedAt: 'mandato_signed_at',
    driveFolderId: 'drive_folder_id',
    driveFolderPath: 'drive_folder_path',
    inventoryPdfUrl: 'inventory_pdf_url',
  };

  /** Convierte ISO 8601 (con o sin Z, con o sin millisegundos) a MySQL DATETIME
   *  `YYYY-MM-DD HH:MM:SS`. Si el valor ya viene en formato MySQL, lo deja igual.
   *  Devuelve null si el input es null/undefined/vacío (para que COALESCE
   *  funcione correctamente en otras rutas). */
  const toMysqlDateTime = (v: any): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return null;
    // Ya está en formato MySQL (10 chars mínimo: YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  // FIX CRÍTICO: el frontend envía `mandateSignedAt` (con "e", forma inglesa)
// pero el snake_case en DB es `mandato_signed_at` (con "o", español). El
// auto-derivado `mandatoSignedAt` (con "o") tampoco coincide con el del frontend.
// Necesitamos probar múltiples variantes para cada campo.
//
// FIX: probar snake_case + camelCase derivado + camelCase "inglés" cuando difiere.
  const fieldAliases: Record<string, string[]> = {
    // DB field           → [snake, camelDerived, camelEnglish (si difiere)]
    'mandato_pdf_url':   ['mandato_pdf_url', 'mandatoPdfUrl', 'mandatePdfUrl'],
    'mandato_signed_at': ['mandato_signed_at', 'mandatoSignedAt', 'mandateSignedAt'],
    'drive_folder_id':   ['drive_folder_id', 'driveFolderId'],
    'drive_folder_path': ['drive_folder_path', 'driveFolderPath'],
    'inventory_pdf_url': ['inventory_pdf_url', 'inventoryPdfUrl'],
    'property_type':     ['property_type', 'propertyType'],
    'owner_name':        ['owner_name', 'ownerName'],
    'owner_id_number':   ['owner_id_number', 'ownerIdNumber'],
    'owner_phone':       ['owner_phone', 'ownerPhone'],
    'owner_email':       ['owner_email', 'ownerEmail'],
  };

  for (const f of allowed) {
    const keys = fieldAliases[f] ?? [f, f.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
    let value: any;
    for (const k of keys) {
      if (req.body[k] !== undefined) { value = req.body[k]; break; }
    }
    if (value !== undefined) {
      // FIX CRÍTICO: convertir fechas ISO 8601 a MySQL DATETIME. Sin esto,
      // MySQL rechaza valores como "2026-06-25T22:11:44.456Z" con
      // "Incorrect datetime value" y el PATCH falla con 500.
      if (f === 'mandato_signed_at') {
        value = toMysqlDateTime(value);
      }
      updates.push(`${f} = ?`);
      values.push(value);
    }
  }

  if (!updates.length) {
    res.json({ success: true, message: 'Nothing to update' });
    return;
  }
  values.push(id);
  try {
    await pool.query(
      `UPDATE properties SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
      [...values, 'default_org'],
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/properties/:id
 *
 * Solo permite eliminar una propiedad si NO tiene inventarios asociados
 * (un inventario es trazabilidad legal, no se puede deshacer).
 *
 * Reglas:
 *  - Si hay CUALQUIER inventario en `inventories` para esta propiedad → 409 con mensaje claro
 *  - Si no hay inventarios → se elimina de MySQL (CASCADE limpia property_documents,
 *    bank_accounts si los hay, etc.) y se intenta vaciar/mover a papelera la carpeta Drive
 *    si quedó vacía (sin tocar archivos con contenido).
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // 1. Verificar existencia y conteo de inventarios
  const [propRows] = await pool.query<any[]>(
    `SELECT id, address, drive_folder_id
     FROM properties
     WHERE id = ? AND organization_id = ?`,
    [id, 'default_org'],
  );

  if (!propRows.length) {
    res.status(404).json({ error: 'Propiedad no encontrada' });
    return;
  }

  const [invRows] = await pool.query<any[]>(
    `SELECT id, phase FROM inventories WHERE property_id = ? LIMIT 1`,
    [id],
  );

  if (invRows.length > 0) {
    res.status(409).json({
      error: 'No se puede eliminar: este inmueble ya tiene inventario(s) asociado(s). Los inventarios son trazabilidad legal y no se pueden deshacer.',
      hasInventories: true,
      inventoryPhase: invRows[0].phase,
    });
    return;
  }

  const property = propRows[0];

  // 2. Borrar de MySQL (FK CASCADE limpia property_documents, bank_accounts si aplica)
  try {
    await pool.query(
      `DELETE FROM properties WHERE id = ? AND organization_id = ?`,
      [id, 'default_org'],
    );
  } catch (err: any) {
    console.error('[DELETE /api/properties] MySQL error:', err.message);
    res.status(500).json({ error: 'Error eliminando propiedad: ' + err.message });
    return;
  }

  // 3. Intentar vaciar la carpeta Drive (best-effort, no bloquea)
  let driveCleanupStatus: 'skipped' | 'deleted' | 'failed' = 'skipped';
  if (property.drive_folder_id) {
    try {
      const drive = await getFreshDriveClient();
      if (drive) {
        const children = await drive.files.list({
          q: `'${property.drive_folder_id}' in parents and trashed=false`,
          fields: 'files(id)',
          spaces: 'drive',
        });
        const childCount = children.data.files?.length ?? 0;
        if (childCount === 0) {
          // Carpeta vacía → mandamos a papelera
          await drive.files.update({
            fileId: property.drive_folder_id,
            requestBody: { trashed: true },
          });
          driveCleanupStatus = 'deleted';
        } else {
          // Tiene archivos subidos (mandato, predial, etc.) → la dejamos,
          // pero la propiedad ya no apunta a ella
          driveCleanupStatus = 'skipped';
        }
      }
    } catch (err: any) {
      console.warn('[DELETE /api/properties] Drive cleanup error:', err.message);
      driveCleanupStatus = 'failed';
    }
  }

  console.log(`[DELETE /api/properties] OK — id: ${id}, drive: ${driveCleanupStatus}`);
  res.json({
    success: true,
    driveCleanupStatus,
    message:
      driveCleanupStatus === 'deleted'
        ? 'Propiedad eliminada y carpeta Drive vaciada'
        : driveCleanupStatus === 'skipped'
          ? 'Propiedad eliminada (la carpeta Drive tenía archivos; queda como histórico)'
          : 'Propiedad eliminada (no se pudo limpiar Drive, hacelo manual si querés)',
  });
});

export default router;