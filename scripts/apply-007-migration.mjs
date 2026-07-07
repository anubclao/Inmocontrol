// Aplica la migración 007 (drive_folder_id en user_oauth_tokens).
// Idempotente: si la columna ya existe, la deja como está.
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'db', 'mysql', 'migrations', '007_drive_folder_id.sql');
const sql = readFileSync(sqlPath, 'utf-8');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  multipleStatements: true,
});

try {
  await conn.query(sql);
  console.log('OK: migración 007 aplicada (drive_folder_id restaurada).');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('OK: drive_folder_id ya existía — nada que hacer.');
  } else {
    console.error('FAIL:', e.code, e.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}