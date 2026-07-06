// Buscar y borrar carpetas de Drive que coincidan con "CL 149 54 16 T1 AP 302" (intent fallido).
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import mysql from 'mysql2/promise';
import { google } from 'googleapis';

const TARGET = 'CL 149 54 16 T1 AP 302';

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inmocontrol',
  connectionLimit: 1,
};

const pool = mysql.createPool(cfg);
const [trows] = await pool.query(
  `SELECT access_token, refresh_token, expiry_date FROM user_oauth_tokens WHERE user_id = ? AND provider = ?`,
  ['default_user', 'google_drive'],
);
await pool.end();

if (trows.length === 0) {
  console.log('No hay tokens OAuth.');
  process.exit(1);
}

const t = trows[0];
const oauth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);
oauth.setCredentials({
  access_token: t.access_token,
  refresh_token: t.refresh_token,
  expiry_date: t.expiry_date,
});

const drive = google.drive({ version: 'v3', auth: oauth });

// Buscar carpeta por nombre en root de InmoControl
const rootFolderId = '1XVB2FP3-r_d5cfHvsRRFdI9K5JJAgFlq';
const res = await drive.files.list({
  q: `name='${TARGET.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
  fields: 'files(id,name)',
  spaces: 'drive',
});
const folders = res.data.files ?? [];
console.log(`Carpetas encontradas con nombre "${TARGET}": ${folders.length}`);
for (const f of folders) {
  console.log(`  - ${f.id} ${f.name}`);
  try {
    await drive.files.update({ fileId: f.id, requestBody: { trashed: true } });
    console.log(`    ✓ Trashed`);
  } catch (err) {
    console.log(`    ✗ Error: ${err.message}`);
  }
}
console.log('Listo.');