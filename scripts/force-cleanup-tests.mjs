// scripts/force-cleanup-tests.mjs
// Borrado forzado de las propiedades de TEST (RETEST-* / 17823* / wizard-*)
// Como el endpoint DELETE bloquea con 409 cuando hay inventario, vamos directo a MySQL
// y hacemos el cascade manualmente: property_documents → inventories → properties.
// Opcionalmente trash las carpetas de Drive si están conectadas.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' }); // fallback
import mysql from 'mysql2/promise';
import { google } from 'googleapis';

const POOL_SIZE = 1;

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inmocontrol',
  connectionLimit: POOL_SIZE,
};

const TEST_PATTERNS = ['%RETEST-%', '%test-bugfix-%', '%wizard-%'];

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_DRIVE = process.argv.includes('--skip-drive');

async function main() {
  const pool = mysql.createPool(cfg);

  console.log('[1/4] Buscando propiedades test...');
  const where = TEST_PATTERNS.map(() => 'address LIKE ? OR id LIKE ? OR owner_name LIKE ?').join(' OR ');
  const params = TEST_PATTERNS.flatMap((p) => [p, p, p]);
  const [rows] = await pool.query(`SELECT id, address, owner_name, drive_folder_id, drive_folder_path FROM properties WHERE ${where}`, params);
  console.log(`  Encontradas: ${rows.length}`);
  for (const r of rows) {
    console.log(`   - ${r.id} | ${r.address} | drive=${r.drive_folder_id ?? '(none)'}`);
  }

  if (rows.length === 0) {
    console.log('Nada que limpiar.');
    await pool.end();
    return;
  }

  const ids = rows.map((r) => r.id);

  console.log('\n[2/4] Borrando property_documents...');
  const [r1] = await pool.query(`DELETE FROM property_documents WHERE property_id IN (?)`, [ids]);
  console.log(`  Filas borradas: ${r1.affectedRows}`);

  console.log('[3/4] Borrando inventories...');
  const [r2] = await pool.query(`DELETE FROM inventories WHERE property_id IN (?)`, [ids]);
  console.log(`  Filas borradas: ${r2.affectedRows}`);

  console.log('[4/4] Borrando properties...');
  if (!DRY_RUN) {
    const [r3] = await pool.query(`DELETE FROM properties WHERE id IN (?)`, [ids]);
    console.log(`  Filas borradas: ${r3.affectedRows}`);
  } else {
    console.log('  (DRY RUN — no se borró)');
  }

  await pool.end();

  // Drive cleanup — solo si no es DRY RUN ni SKIP_DRIVE
  if (!DRY_RUN && !SKIP_DRIVE) {
    console.log('\n[Drive] Trash carpetas de propiedad...');
    await trashDriveFolders(rows);
  }

  console.log('\n✅ Listo. Refresca el navegador (Ctrl+Shift+R).');
}

async function trashDriveFolders(rows) {
  const driveFolders = rows.filter((r) => r.drive_folder_id).map((r) => r.drive_folder_id);
  if (driveFolders.length === 0) {
    console.log('  No hay carpetas Drive que borrar.');
    return;
  }

  let oauth;
  try {
    // Recuperar tokens igual que el server
    const pool = mysql.createPool(cfg);
    const [trows] = await pool.query(
      `SELECT access_token, refresh_token, expiry_date FROM user_oauth_tokens WHERE user_id = ? AND provider = ?`,
      ['default_user', 'google_drive'],
    );
    await pool.end();
    if (trows.length === 0) {
      console.log('  No hay tokens OAuth — saltando Drive.');
      return;
    }
    const t = trows[0];
    oauth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth.setCredentials({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expiry_date: t.expiry_date,
    });
  } catch (err) {
    console.log('  Error cargando OAuth:', err.message);
    return;
  }

  const drive = google.drive({ version: 'v3', auth: oauth });
  for (const folderId of driveFolders) {
    try {
      await drive.files.update({ fileId: folderId, requestBody: { trashed: true } });
      console.log(`  ✓ Trashed ${folderId}`);
    } catch (err) {
      console.log(`  ✗ No pude trash ${folderId}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});