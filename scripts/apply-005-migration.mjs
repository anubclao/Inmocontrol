// Aplica la migración 005_owner_payouts.sql contra MySQL.
// Patrón: leer SQL + correr con multipleStatements:true.
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
  const sqlPath = path.resolve('db/mysql/migrations/005_owner_payouts.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);

  await pool.query(sql);

  console.log('[migrate] OK. Verificando tabla owner_payouts...');
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'owner_payouts'
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
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'owner_payouts'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  console.log('[migrate] Foreign keys:', fks);

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});