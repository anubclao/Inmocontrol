// Aplica la migración 012_unique_invoice_number.sql contra MySQL.
// (BUG-032) — idempotente: si la constraint ya existe, no hace nada.
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
  const sqlPath = path.resolve('db/mysql/migrations/012_unique_invoice_number.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);
  await pool.query(sql);

  // Verificar que la constraint quedó
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'rent_invoices'
       AND CONSTRAINT_NAME = 'uniq_invoice_number'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  if (rows.length > 0) {
    console.log('[migrate] OK. Constraint uniq_invoice_number aplicada.');
  } else {
    console.log('[migrate] La migration corrió pero la constraint no quedó aplicada (puede que haya duplicados). Verificá manualmente.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
