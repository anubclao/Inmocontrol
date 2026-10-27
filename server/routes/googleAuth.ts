import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // carga .env.local (no el .env por defecto)
import express from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import { Readable } from 'stream';
// FIX #2 (P0 seguridad): requireAuth en endpoints privados de Google (upload-pdf, file proxy).
// FIX 2026-10: /auth/google también requiere auth (ver documento abajo).
import { requireAuth } from './auth.js';
// fix-issue-permissions-by-endpoint: uploads a Drive requieren canManageDrive.
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  candidateDriveUserIds,
  deleteDriveTokens,
  describeDriveConnection,
  getDriveClientForRequest,
  getDriveContext,
  saveDriveTokens,
} from '../lib/driveClient.js';

// FIX #2 (P0 seguridad): las rutas de Drive requieren auth.
//
// FIX 2026-10 (auditoría Drive/Inventarios): `/auth/google` TAMBIÉN requiere
// auth ahora. Antes era anónimo y el callback guardaba los tokens bajo el email
// de Google (o `default_user`), así que:
//   · un usuario nuevo conectaba su Gmail y la app seguía usando la fila de
//     `default_user` → nunca veía su propio Drive;
//   · dos usuarios en la misma instancia se pisaban los tokens (el último
//     conectado se quedaba con el Drive de todos).
// Ahora el flujo se ata al `profiles.id` de la sesión vía el parámetro `state`.

/** Genera un cliente OAuth nuevo por request. NUNCA compartir uno global:
 *  `setCredentials()` sobre un singleton pisa las credenciales de otra request
 *  en vuelo y termina escribiendo en el Drive de otro usuario. */
function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// Scopes: drive.file = solo archivos creados por esta app (no accede al Drive completo).
// openid + email: nos deja identificar CUENTA de Google conectada (para logs de
// soporte y para detectar "conectaste la cuenta equivocada"). Son scopes no
// sensibles: no agregan trámite de verificación en Google Cloud.
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
];

/** Estados OAuth pendientes: `state` → quién inició el flujo.
 *  En memoria (igual que las sesiones del piloto, ver routes/auth.ts). Si el
 *  server reinicia en medio del flujo, el usuario simplemente reintenta. */
const pendingOAuthStates = new Map<
  string,
  { profileId: string; email: string; createdAt: number }
>();
const STATE_TTL_MS = 10 * 60 * 1000;

function purgeExpiredStates() {
  const now = Date.now();
  for (const [key, value] of pendingOAuthStates) {
    if (now - value.createdAt > STATE_TTL_MS) pendingOAuthStates.delete(key);
  }
}

/** Genera la URL de autorización de Google (requiere sesión válida). */
router.get('/auth/google', requireAuth, (req, res) => {
  console.log('[OAuth] /auth/google llamado. GOOGLE_CLIENT_ID presente:', !!process.env.GOOGLE_CLIENT_ID);
  const user = (req as any).user as { id: string; email: string };
  purgeExpiredStates();
  const state = crypto.randomBytes(24).toString('hex');
  pendingOAuthStates.set(state, {
    profileId: user.id,
    email: user.email,
    createdAt: Date.now(),
  });
  const oauth2Client = newOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // obtiene refresh_token (persiste entre sesiones)
    scope: SCOPES,
    state,
    // prompt=consent fuerza la pantalla de consentimiento (necesario para recibir
    // el refresh_token la primera vez — sin esto Google puede no devolverlo)
    prompt: 'consent',
    include_granted_scopes: true,
  });
  res.json({ url });
});

/** Resuelve la URL del frontend para redirects post-OAuth.
 *  - Producción: APP_URL (https://inmocontrol.tecnowebsupportia.com)
 *  - Dev:        FRONTEND_URL o fallback http://localhost:3000
 *  NUNCA hardcodear localhost — los usuarios de prod terminan en su propia máquina.
 */
const FRONTEND_REDIRECT_BASE = (
  process.env.APP_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');  // sin slash final para concatenar limpio

/** Callback de Google — intercambia code por tokens y guarda en MySQL. */
// BUG-029: migrado a asyncHandler. Conserva el redirect en error en vez de 500 HTML,
// porque el browser está esperando un redirect, no un JSON.
router.get('/auth/google/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  console.log('[OAuth] Callback recibido:', { error, hasCode: !!code, hasState: !!state, codePreview: code ? code.slice(0, 20) + '...' : null });

  if (error || !code) {
    console.log('[OAuth] Error o sin código:', error);
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=${encodeURIComponent(error || 'no_code')}`);
    return;
  }

  // ── Validación del `state` (anti-CSRF) ────────────────────────────────────
  // Sin esto, cualquiera podía fabricar un callback con su propio `code` y
  // dejar la app conectada al Drive del atacante. Es de un solo uso.
  const pending = state ? pendingOAuthStates.get(state) : undefined;
  if (state) pendingOAuthStates.delete(state);
  if (!pending) {
    console.warn('[OAuth] state inválido o expirado — flujo rechazado');
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=invalid_state`);
    return;
  }
  if (Date.now() - pending.createdAt > STATE_TTL_MS) {
    console.warn('[OAuth] state expirado (TTL 10 min) — flujo rechazado');
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=state_expired`);
    return;
  }

  try {
    console.log('[OAuth] Intercambiando code por tokens...');
    const oauth2Client = newOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    console.log('[OAuth] Tokens recibidos:', { hasAccess: !!tokens.access_token, hasRefresh: !!tokens.refresh_token, expiry: tokens.expiry_date });
    if (!tokens.access_token) {
      throw new Error('Google no devolvió access_token');
    }
    oauth2Client.setCredentials(tokens);

    // Cuenta de Google que autorizó (solo para log/soporte).
    const googleAccount = extractEmailFromIdToken(tokens.id_token ?? '');
    console.log(
      `[OAuth] Usuario app: ${pending.email} (${pending.profileId}) · cuenta Google: ${googleAccount ?? 'desconocida'}`,
    );

    console.log('[OAuth] Creando/buscando carpeta en Drive...');
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await getOrCreateInmoControlFolder(drive, pending.profileId);
    console.log('[OAuth] Carpeta:', folderId);

    console.log('[OAuth] Guardando tokens en MySQL...');
    // user_id = profiles.id → cada usuario tiene SU fila. `saveDriveTokens`
    // conserva el refresh_token anterior si Google no manda uno nuevo.
    await saveDriveTokens({
      userId: pending.profileId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ?? null,
      driveFolderId: folderId,
      scopes: tokens.scope ?? SCOPES.join(' '),
    });

    console.log('[OAuth] ✓ Éxito! Redirigiendo al frontend.');
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_connected=1&folder=${encodeURIComponent(folderId)}`);
  } catch (err: any) {
    console.error('[OAuth] Error completo:', err?.message, err?.response?.data);
    const detail = err?.response?.data?.error || err?.message || 'token_exchange_failed';
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=${encodeURIComponent(detail)}`);
  }
}));

// FIX #2: las rutas privadas de Google Drive requieren auth.
// BUG-029: migrado a asyncHandler.
router.post('/upload/google-drive', requireAuth, requireRole('canManageDrive'), asyncHandler(async (req, res) => {
  const { propertyId, docType, fileName, base64Data } = req.body as {
    propertyId: string;
    docType: string;
    fileName: string;
    base64Data: string;
  };

  if (!propertyId || !docType || !base64Data) {
    res.status(400).json({ error: 'Faltan campos requeridos: propertyId, docType, base64Data' });
    return;
  }

  // Tokens del usuario de la sesión (perfil) con fallback legacy.
  const ctx = await getDriveContext(req);
  if (!ctx || !ctx.rootFolderId) {
    res.status(401).json({
      error: 'No connected to Google Drive. Please connect first.',
      code: 'DRIVE_NOT_CONNECTED',
    });
    return;
  }
  const { drive, rootFolderId: drive_folder_id } = ctx;

  // Subcarpeta por propiedad: "InmoControl / {propertyId}"
  const propFolderId = await getOrCreatePropertyFolder(drive, drive_folder_id, propertyId);

  // Limpia el base64 y sube
  const buffer = Buffer.from(base64Data.replace(/^data:application\/pdf;base64,/, ''), 'base64');
  const mimeType = 'application/pdf';
  const finalFileName = `${docType}_${fileName}`;

  const uploadedFile = await drive.files.create({
    requestBody: {
      name: finalFileName,
      parents: [propFolderId],
    },
    media: { mimeType, body: buffer },
    fields: 'id, name, webViewLink',
  });

  // Hacer el archivo públicamente visible (el usuario puede compartir el link)
  await drive.permissions.create({
    fileId: uploadedFile.data.id!,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  res.json({
    success: true,
    fileId: uploadedFile.data.id,
    fileName: uploadedFile.data.name,
    webViewLink: uploadedFile.data.webViewLink,
  });
}));

/** Estado de conexión del usuario.
 *
 * FIX Karpathy (jul-2026): el endpoint debe reflejar la verdad sobre si el
 * client puede operar contra Drive AHORA, no solo si hay tokens guardados.
 * El bug histórico: decía `connected: true` si había drive_folder_id, pero el
 * access_token podía estar expirado o el refresh_token revocado → el server
 * fallaba con "No hay conexión" mientras el cliente creía que todo estaba OK.
 *
 * FIX 2026-10: además devuelve `source` ('user' | 'legacy') para que la UI
 * pueda avisar cuando el usuario está usando los tokens legacy de
 * `default_user` (cuenta de la agencia) en vez de su propio Gmail. */
router.get('/status/google-drive', requireAuth, asyncHandler(async (req, res) => {
  const status = await describeDriveConnection(req);
  if (status.reason === 'legacy') {
    // Telemetría para la migración: mientras el fallback esté activo no hay
    // forma de saber cuántos usuarios siguen colgados de la fila vieja sin
    // este log. Cuando deje de aparecer, es seguro poner
    // DRIVE_LEGACY_FALLBACK=false.
    const requester = (req as any).user?.id ?? 'anon';
    console.warn(
      `[drive] fallback LEGACY en uso · token_user_id=${status.userId} · solicitante=${requester}`,
    );
  }
  res.json({
    connected: status.connected,
    folderId: status.folderId,
    reason: status.reason === 'ok' ? undefined : status.reason,
    source: status.reason === 'legacy' ? 'legacy' : status.connected ? 'user' : undefined,
  });
}));

/** Desconectar Google Drive (borra SOLO los tokens del usuario actual). */
router.delete('/auth/google-drive', requireAuth, requireRole('canManageDrive'), asyncHandler(async (req, res) => {
  // `candidateDriveUserIds` incluye el fallback legacy: si el usuario venía
  // usando la fila `default_user`, desconectar tiene que borrarla también.
  const deleted = await deleteDriveTokens(candidateDriveUserIds(req));
  console.log(`[OAuth] Drive desconectado · filas borradas: ${deleted}`);
  res.json({ success: true });
}));

/**
 * Sube un archivo a una subcarpeta de Drive.
 * POST /api/drive/upload-file
 * Body: { propertyId, folderId, subfolder, fileName, base64Data }
 */
// BUG-029: migrado a asyncHandler.
router.get('/drive/create-property-folders', requireAuth, asyncHandler(async (req, res) => {
  const { propertyId, propertyName } = req.query as Record<string, string>;
  if (!propertyId || !propertyName) {
    res.status(400).json({ error: 'Faltan propertyId o propertyName' });
    return;
  }

  const ctx = await getDriveContext(req);
  if (!ctx?.rootFolderId) {
    res.status(401).json({ error: 'No connected to Google Drive' });
    return;
  }
  const { drive, rootFolderId } = ctx;

  // 1. Buscar si ya existe una carpeta con este nombre bajo InmoControl/
  //    (defensa contra doble-creación si el cliente llama este endpoint dos veces)
  const existing = await drive.files.list({
    q: `name='${String(propertyName).replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let propertyFolderId: string;
  if (existing.data.files && existing.data.files.length > 0) {
    // Ya existe — reusar
    propertyFolderId = existing.data.files[0].id!;
    console.log(`[Drive] Carpeta "${propertyName}" ya existía → reusando ${propertyFolderId}`);
  } else {
    // Crear carpeta de la propiedad dentro de InmoControl
    const propertyFolder = await drive.files.create({
      requestBody: {
        name: propertyName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      },
      fields: 'id',
    });
    propertyFolderId = propertyFolder.data.id!;

    // 2. Crear subcarpeta Propietario
    await drive.files.create({
      requestBody: {
        name: 'Propietario',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [propertyFolderId],
      },
      fields: 'id',
    });

    // 3. Crear subcarpeta Inventarios
    await drive.files.create({
      requestBody: {
        name: 'Inventarios',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [propertyFolderId],
      },
      fields: 'id',
    });
  }

  console.log(`[Drive] Carpetas creadas para "${propertyName}": ${propertyFolderId}`);
  res.json({ propertyFolderId });
}));

/**
 * Sube un archivo a una subcarpeta de Drive.
 * POST /api/drive/upload-file
 * Body: { propertyId, folderId, subfolder, fileName, base64Data }
 */
// BUG-029: migrado a asyncHandler.
router.post('/drive/upload-file', requireAuth, requireRole('canManageDrive'), asyncHandler(async (req, res) => {
  const { propertyId, folderId, subfolder, fileName, base64Data } = req.body as {
    propertyId: string;
    folderId: string;
    subfolder: string;
    fileName: string;
    base64Data: string;
  };

  if (!folderId || !subfolder || !fileName || !base64Data) {
    res.status(400).json({ error: 'Faltan campos requeridos' });
    return;
  }

  const drive = await getDriveClientForRequest(req);
  if (!drive) {
    res.status(401).json({
      error: 'No connected to Google Drive',
      code: 'DRIVE_NOT_CONNECTED',
    });
    return;
  }

  // Buscar el ID de la subcarpeta (Propietario o Inventarios)
  const subfolderRes = await drive.files.list({
    q: `name='${subfolder}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  const subfolderId = subfolderRes.data.files?.[0]?.id;
  if (!subfolderId) {
    res.status(404).json({ error: `Subcarpeta "${subfolder}" no encontrada dentro de la propiedad` });
    return;
  }

  // Decodificar base64 a buffer
  const fileBuffer = Buffer.from(base64Data, 'base64');

  // Subir archivo
  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [subfolderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(fileBuffer),
    },
    fields: 'id, webViewLink',
  });

  console.log(`[Drive] Archivo "${fileName}" subido a "${subfolder}" para propiedad ${propertyId}`);
  res.json({ fileId: uploaded.data.id, webViewLink: uploaded.data.webViewLink });
}));

/**
 * Sube un PDF a una subcarpeta ARBITRARIA de Drive (crea la subcarpeta si no existe).
 *
 * Versión genérica del endpoint anterior: acepta cualquier nombre de subcarpeta
 * (no restringido a 'Propietario' | 'Inventarios'). Usado por:
 *   - Estado de cuenta del propietario → `Propietario/EstadosCuenta/`
 *   - Cuenta de cobro al inquilino → `Recibos/` (via uploadPdfToDrive del frontend)
 *   - Cualquier futura subida con carpeta custom
 *
 * POST /api/drive/upload-pdf
 * Body: {
 *   parentFolderId: string,           // ID de la carpeta padre en Drive
 *   parentKind?: 'property' | 'tenant' | 'custom',  // solo para logging
 *   subfolder: string,                // nombre de la subcarpeta (se crea si no existe)
 *   fileName: string,
 *   base64Data: string
 * }
 */
// BUG-029: migrado a asyncHandler.
router.post('/drive/upload-pdf', requireAuth, requireRole('canManageDrive'), asyncHandler(async (req, res) => {
  const { parentFolderId, parentKind, subfolder, fileName, base64Data } = req.body as {
    parentFolderId: string;
    parentKind?: 'property' | 'tenant' | 'custom';
    subfolder: string;
    fileName: string;
    base64Data: string;
  };

  if (!parentFolderId || !subfolder || !fileName || !base64Data) {
    res.status(400).json({ error: 'Faltan campos requeridos (parentFolderId, subfolder, fileName, base64Data)' });
    return;
  }

  const drive = await getDriveClientForRequest(req);
  if (!drive) {
    res.status(503).json({
      error: 'Google Drive no conectado',
      code: 'DRIVE_NOT_CONNECTED',
    });
    return;
  }

  // 1. Buscar o crear la subcarpeta (genérica, no restringida a un set fijo)
  const subfolderRes = await drive.files.list({
    q: `name='${subfolder.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let subfolderId = subfolderRes.data.files?.[0]?.id;
  if (!subfolderId) {
    const created = await drive.files.create({
      requestBody: {
        name: subfolder,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
    });
    subfolderId = created.data.id!;
    console.log(`[Drive] Subcarpeta "${subfolder}/" creada para parent ${parentKind ?? parentFolderId}`);
  }

  // 2. Subir el PDF
  const fileBuffer = Buffer.from(base64Data, 'base64');
  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [subfolderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(fileBuffer),
    },
    fields: 'id, webViewLink',
  });

  // 3. Hacer accesible públicamente (mismo patrón que los demás endpoints)
  await drive.permissions.create({
    fileId: uploaded.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  console.log(`[Drive] PDF "${fileName}" → ${parentKind ?? 'parent'}/${subfolder}/`);
  res.json({
    fileId: uploaded.data.id,
    webViewLink: uploaded.data.webViewLink,
    subfolder,
  });
}));

// ── Helpers ────────────────────────────────────────────────────────────────

/** Busca o crea la carpeta raíz "InmoControl" en el Drive del usuario. */
async function getOrCreateInmoControlFolder(drive: any, userId: string): Promise<string> {
  const name = 'InmoControl';
  const response = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files?.length) return response.data.files[0].id!;

  const folder = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return folder.data.id!;
}

/** Decodifica el email del id_token JWT de Google sin llamar a la API. */
function extractEmailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

/** Busca o crea la subcarpeta "{propertyId}" dentro de la carpeta InmoControl. */
async function getOrCreatePropertyFolder(drive: any, parentId: string, propertyId: string): Promise<string> {
  const name = `Propiedad_${propertyId}`;
  const response = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files?.length) return response.data.files[0].id!;

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id!;
}

/**
 * GET /api/drive/file?fileId=XXX&download=1
 *
 * Proxy que sirve un archivo de Google Drive usando el OAuth token guardado
 * en MySQL. Esto evita el bug del iframe de Drive que muestra
 * "Necesitas acceso" cuando el browser está logueado en otra cuenta de Google.
 *
 * - Por default, embebe en navegador (Content-Disposition: inline).
 * - Con `download=1`, fuerza descarga con el nombre original.
 * - Cache-Control público por 5 minutos (los archivos no cambian seguido).
 *
 * Para imágenes, el cliente puede preferir `/api/drive/thumb` que usa
 * `thumbnailLink` directo (más liviano y con Content-Type correcto).
 */
// BUG-029: migrado a asyncHandler.
router.get('/drive/file', requireAuth, asyncHandler(async (req, res) => {
  const { fileId, download } = req.query as Record<string, string>;
  if (!fileId) {
    res.status(400).json({ error: 'Falta fileId' });
    return;
  }
  try {
    const drive = await getDriveClientForRequest(req);
    if (!drive) {
      res.status(503).json({ error: 'Google Drive no conectado. Reconectar en Configuración.' });
      return;
    }
    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
      supportsAllDrives: false,
    });
    const mimeType = meta.data.mimeType ?? 'application/octet-stream';
    const name = meta.data.name ?? `drive-${fileId}`;
    const dl = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: false },
      { responseType: 'stream' },
    );
    res.setHeader('Content-Type', mimeType);
    if (meta.data.size) res.setHeader('Content-Length', String(meta.data.size));
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${name.replace(/"/g, '')}"`);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    (dl.data as Readable).pipe(res);
  } catch (err: any) {
    if (err.code === 404) {
      res.status(404).json({ error: 'Archivo no encontrado en Drive' });
      return;
    }
    if (err.code === 403) {
      res.status(403).json({ error: 'Sin permisos para acceder al archivo' });
      return;
    }
    throw err; // BUG-029: propagar al errorHandler central
  }
}));

/**
 * GET /api/drive/thumb?fileId=XXX&sz=w800
 *
 * Miniatura/cacheable para imágenes y PDFs. Usa el `thumbnailLink` que Drive
 * ya genera server-side. Si no hay thumbnailLink, redirige al endpoint /file.
 */
// BUG-029: migrado a asyncHandler.
router.get('/drive/thumb', requireAuth, asyncHandler(async (req, res) => {
  const { fileId, sz } = req.query as Record<string, string>;
  const sizeSuffix = sz && /^w\d+$/.test(sz) ? sz : 'w800';
  if (!fileId) {
    res.status(400).json({ error: 'Falta fileId' });
    return;
  }
  const drive = await getDriveClientForRequest(req);
  if (!drive) {
    res.status(503).json({ error: 'Google Drive no conectado.' });
    return;
  }
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, thumbnailLink',
    supportsAllDrives: false,
  });
  const thumb = meta.data.thumbnailLink;
  if (thumb) {
    const sized = thumb.replace(/=s\d+(-c)?$/, `=${sizeSuffix}$1`);
    res.redirect(302, sized);
  } else {
    res.redirect(302, `/api/drive/file?fileId=${encodeURIComponent(fileId)}`);
  }
}));

export default router;
