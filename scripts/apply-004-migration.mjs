// Aplica la migración 004_invoice_number.sql contra MySQL.
// Patrón: leer SQL + correr con multipleStatements:true (mismo que apply-saas-billing-migration.mjs).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 2,
});

async function main() {
  const sqlPath = path.resolve('db/mysql/migrations/004_invoice_number.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);

  await pool.query(sql);

  console.log('[migrate] OK. Verificando columna...');
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'rent_invoices' AND COLUMN_NAME = 'invoice_number'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  console.log('[migrate] Columna rent_invoices.invoice_number:', cols);

  const [idx] = await pool.query(
    `SELECT INDEX_NAME, COLUMN_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'rent_invoices' AND INDEX_NAME = 'invoices_invoice_number_idx'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  console.log('[migrate] Índice invoices_invoice_number_idx:', idx);

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});