import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // carga .env.local (no el .env por defecto)
import express from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import { Readable } from 'stream';
import pool, { checkDb } from '../db.js';

const router = express.Router();
import { isTokenExpiringSoon } from '../lib/googleAuth.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

// Scopes: drive.file = solo archivos creados por esta app (no accede al Drive completo)
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

/** Genera la URL de autorización de Google. */
router.get('/auth/google', (_req, res) => {
  console.log('[OAuth] /auth/google llamado. GOOGLE_CLIENT_ID presente:', !!process.env.GOOGLE_CLIENT_ID);
  const state = crypto.randomBytes(16).toString('hex');
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // obtiene refresh_token (persiste entre sesiones)
    scope: SCOPES,
    state,
    // prompt=consent fuerza la pantalla de consentimiento (necesario para recibir
    // el refresh_token la primera vez — sin esto Google puede no devolverlo)
    prompt: 'consent',
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
router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  console.log('[OAuth] Callback recibido:', { error, hasCode: !!code, codePreview: code ? code.slice(0, 20) + '...' : null });

  if (error || !code) {
    console.log('[OAuth] Error o sin código:', error);
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=${encodeURIComponent(error || 'no_code')}`);
    return;
  }

  try {
    console.log('[OAuth] Intercambiando code por tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('[OAuth] Tokens recibidos:', { hasAccess: !!tokens.access_token, hasRefresh: !!tokens.refresh_token, expiry: tokens.expiry_date });
    oauth2Client.setCredentials(tokens);

    // Extraer email del id_token JWT sin llamar a la API de profile
    const userId = extractEmailFromIdToken(tokens.id_token ?? '') ?? 'default_user';
    console.log('[OAuth] Usuario:', userId);

    console.log('[OAuth] Creando/buscando carpeta en Drive...');
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await getOrCreateInmoControlFolder(drive, userId);
    console.log('[OAuth] Carpeta:', folderId);

    console.log('[OAuth] Guardando tokens en MySQL...');
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO user_oauth_tokens (id, user_id, provider, access_token, refresh_token, expiry_date, drive_folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         access_token    = VALUES(access_token),
         refresh_token   = VALUES(refresh_token),
         expiry_date     = VALUES(expiry_date),
         drive_folder_id = VALUES(drive_folder_id),
         updated_at      = CURRENT_TIMESTAMP`,
      [
        id,
        userId,
        'google_drive',
        tokens.access_token,
        tokens.refresh_token ?? null,
        tokens.expiry_date ?? null,
        folderId,
      ],
    );

    console.log('[OAuth] ✓ Éxito! Redirigiendo al frontend.');
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_connected=1&folder=${encodeURIComponent(folderId)}`);
  } catch (err: any) {
    console.error('[OAuth] Error completo:', err?.message, err?.response?.data);
    const detail = err?.response?.data?.error || err?.message || 'token_exchange_failed';
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=${encodeURIComponent(detail)}`);
  }
});

/** Subir un archivo PDF al Drive del usuario autenticado. */
router.post('/upload/google-drive', async (req, res) => {
  try {
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

    // Obtiene los tokens del usuario desde MySQL
    // Por ahora usamos 'default_user' — cuando haya auth real, usar el user_id real
    const userId = 'default_user';
    const [rows] = await pool.query<any[]>(
      'SELECT access_token, refresh_token, expiry_date, drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
      [userId, 'google_drive'],
    );

    if (!rows.length || !rows[0].access_token) {
      res.status(401).json({ error: 'No connected to Google Drive. Please connect first.' });
      return;
    }

    const { access_token, refresh_token, expiry_date, drive_folder_id } = rows[0];

    // Recrea el cliente con los tokens guardados
    oauth2Client.setCredentials({
      access_token,
      refresh_token: refresh_token ?? undefined,
      expiry_date: expiry_date ?? undefined,
    });

    // Renueva token si está próximo a expirar
    if (isTokenExpiringSoon(expiry_date)) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      // Actualiza tokens renovados en MySQL
      await pool.query(
        'UPDATE user_oauth_tokens SET access_token=?, expiry_date=? WHERE user_id=? AND provider=?',
        [credentials.access_token, credentials.expiry_date, userId, 'google_drive'],
      );
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
  } catch (err: any) {
    console.error('[Google Drive] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Estado de conexión del usuario. */
router.get('/status/google-drive', async (req, res) => {
  const userId = 'default_user';
  const [rows] = await pool.query<any[]>(
    'SELECT drive_folder_id, updated_at FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
    [userId, 'google_drive'],
  );
  if (rows.length > 0 && rows[0].drive_folder_id) {
    res.json({ connected: true, folderId: rows[0].drive_folder_id });
  } else {
    res.json({ connected: false });
  }
});

/** Desconectar Google Drive (borra tokens). */
router.delete('/auth/google-drive', async (req, res) => {
  const userId = 'default_user';
  await pool.query('DELETE FROM user_oauth_tokens WHERE user_id = ? AND provider = ?', [userId, 'google_drive']);
  res.json({ success: true });
});

/**
 * Sube un archivo a una subcarpeta de Drive.
 * POST /api/drive/upload-file
 * Body: { propertyId, folderId, subfolder, fileName, base64Data }
 */
router.get('/drive/create-property-folders', async (req, res) => {
  const { propertyId, propertyName } = req.query as Record<string, string>;
  if (!propertyId || !propertyName) {
    res.status(400).json({ error: 'Faltan propertyId o propertyName' });
    return;
  }

  const userId = 'default_user';
  const [rows] = await pool.query<any[]>(
    'SELECT access_token, refresh_token, expiry_date, drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
    [userId, 'google_drive'],
  );
  if (!rows.length || !rows[0].drive_folder_id) {
    res.status(401).json({ error: 'No connected to Google Drive' });
    return;
  }

  const { access_token, refresh_token, expiry_date, drive_folder_id: rootFolderId } = rows[0];
  oauth2Client.setCredentials({
    access_token,
    refresh_token: refresh_token ?? undefined,
    expiry_date: expiry_date ?? undefined,
  });

  if (isTokenExpiringSoon(expiry_date)) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
});

/**
 * Sube un archivo a una subcarpeta de Drive.
 * POST /api/drive/upload-file
 * Body: { propertyId, folderId, subfolder, fileName, base64Data }
 */
router.post('/drive/upload-file', async (req, res) => {
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

  const userId = 'default_user';
  const [rows] = await pool.query<any[]>(
    'SELECT access_token, refresh_token, expiry_date FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
    [userId, 'google_drive'],
  );
  if (!rows.length) {
    res.status(401).json({ error: 'No connected to Google Drive' });
    return;
  }

  const { access_token, refresh_token, expiry_date } = rows[0];
  oauth2Client.setCredentials({ access_token, refresh_token: refresh_token ?? undefined, expiry_date: expiry_date ?? undefined });
  if (isTokenExpiringSoon(expiry_date)) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
});

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
router.post('/drive/upload-pdf', async (req, res) => {
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

  try {
    const drive = await getFreshDriveClientPublic();
    if (!drive) {
      res.status(503).json({ error: 'Google Drive no conectado' });
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
  } catch (err: any) {
    console.error('[Drive] Error en /upload-pdf:', err.message);
    res.status(500).json({ error: 'Error subiendo a Drive: ' + err.message });
  }
});

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
router.get('/drive/file', async (req, res) => {
  const { fileId, download } = req.query as Record<string, string>;
  if (!fileId) {
    res.status(400).json({ error: 'Falta fileId' });
    return;
  }
  try {
    const drive = await getFreshDriveClientPublic();
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
    console.error('[drive/file proxy]', err.message);
    if (err.code === 404) {
      res.status(404).json({ error: 'Archivo no encontrado en Drive' });
    } else if (err.code === 403) {
      res.status(403).json({ error: 'Sin permisos para acceder al archivo' });
    } else {
      res.status(500).json({ error: 'Error al obtener archivo: ' + err.message });
    }
  }
});

/**
 * GET /api/drive/thumb?fileId=XXX&sz=w800
 *
 * Miniatura/cacheable para imágenes y PDFs. Usa el `thumbnailLink` que Drive
 * ya genera server-side. Si no hay thumbnailLink, redirige al endpoint /file.
 */
router.get('/drive/thumb', async (req, res) => {
  const { fileId, sz } = req.query as Record<string, string>;
  const sizeSuffix = sz && /^w\d+$/.test(sz) ? sz : 'w800';
  if (!fileId) {
    res.status(400).json({ error: 'Falta fileId' });
    return;
  }
  try {
    const drive = await getFreshDriveClientPublic();
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
  } catch (err: any) {
    console.error('[drive/thumb]', err.message);
    res.status(500).json({ error: 'Error al obtener thumbnail: ' + err.message });
  }
});

/** Wrapper público de getFreshDriveClient para los proxies. Refresca el access_token
 *  si está por expirar y lo persiste. Devuelve null si no hay tokens. */
async function getFreshDriveClientPublic(): Promise<ReturnType<typeof google.drive> | null> {
  const [rows] = await pool.query<any[]>(
    'SELECT access_token, refresh_token, expiry_date FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
    ['default_user', 'google_drive'],
  );
  if (!rows.length || !rows[0].access_token) return null;
  oauth2Client.setCredentials({
    access_token: rows[0].access_token,
    refresh_token: rows[0].refresh_token ?? undefined,
    expiry_date: rows[0].expiry_date ?? undefined,
  });
  if (isTokenExpiringSoon(rows[0].expiry_date)) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await pool.query(
        'UPDATE user_oauth_tokens SET access_token=?, expiry_date=? WHERE user_id=? AND provider=?',
        [credentials.access_token, credentials.expiry_date, 'default_user', 'google_drive'],
      );
    } catch (err: any) {
      console.warn('[OAuth] Refresh failed:', err.message);
      return null;
    }
  }
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export default router;
