// Aplica la migración 011_property_charges.sql contra MySQL.
// (BUG-031: antes era 006_property_charges.sql — renombrada para no chocar
// con 006_password_hash.sql).
// Patrón: leer SQL + correr con multipleStatements:true.
// Idempotente: usa CREATE TABLE IF NOT EXISTS y el backfill chequea por
// (property_id, period, description, amount) para no duplicar.
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
  const sqlPath = path.resolve('db/mysql/migrations/011_property_charges.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);

  await pool.query(sql);

  console.log('[migrate] OK. Verificando tabla property_charges...');
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'property_charges'
     ORDER BY ORDINAL_POSITION`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  console.log('[migrate] Columnas:');
  for (const c of cols) {
    console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.IS_NULLABLE === 'YES' ? ', NULL' : ''})`);
  }

  const [fks] = await pool.query(
    `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
     FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'property_charges'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  console.log('[migrate] Foreign keys:', fks);

  const [counts] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(charged_to='owner') AS owner_count,
            SUM(charged_to='tenant') AS tenant_count,
            SUM(charged_to='both') AS both_count
     FROM property_charges`
  );
  console.log('[migrate] Conteos por charged_to:', counts[0]);

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
