// Drive cleanup: trash la carpeta de la propiedad de prueba específica.
// MySQL ya está limpio, solo queda la carpeta en Drive.
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import mysql from 'mysql2/promise';
import { google } from 'googleapis';

const PROP_ID = '89dcd391-bccf-41e3-ba1c-ae1fc1ee4a03';
const DRIVE_FOLDER_ID = '16iZfSsyy0uFC5Ad_iU9S78mFUcZGvYbO';

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inmocontrol',
  connectionLimit: 1,
};

console.log(`Trashing Drive folder ${DRIVE_FOLDER_ID} para propiedad ${PROP_ID}...`);

// Cargar OAuth tokens
const pool = mysql.createPool(cfg);
const [trows] = await pool.query(
  `SELECT access_token, refresh_token, expiry_date FROM user_oauth_tokens WHERE user_id = ? AND provider = ?`,
  ['default_user', 'google_drive'],
);
await pool.end();

if (trows.length === 0) {
  console.log('  No hay tokens OAuth en user_oauth_tokens. Abortando.');
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

try {
  // Trash la carpeta (soft delete — recuperable por 30 días)
  await drive.files.update({ fileId: DRIVE_FOLDER_ID, requestBody: { trashed: true } });
  console.log(`  ✓ Carpeta ${DRIVE_FOLDER_ID} mandada a Papelera de Drive`);
} catch (err) {
  console.log(`  ✗ Error trashing carpeta: ${err.message}`);
  process.exit(1);
}

console.log('\nDrive cleanup listo.');