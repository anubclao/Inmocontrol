// Aplica la migración 009 (inventory_captacion_pdf_url + inventory_colocacion_pdf_url
// en properties). Idempotente: si las columnas ya existen, no hace nada.
//
// Aplicar contra Hostinger:  copiá este script + el SQL al proyecto, después:
//   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... node scripts/apply-009-migration.mjs
//
// O más fácil: pegá las 2 sentencias ALTER en phpMyAdmin → pestaña SQL.

import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'db', 'mysql', 'migrations', '009_properties_inventory_pdf_urls.sql');
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
  // Pre-check: si ambas columnas ya existen, no corremos el SQL (es más rápido
  // y nos ahorra errores tontos en re-runs).
  const [before] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'properties'
       AND COLUMN_NAME IN ('inventory_captacion_pdf_url','inventory_colocacion_pdf_url')`,
    [process.env.DB_NAME ?? 'inmocontrol'],
  );
  const existing = new Set(before.map((r) => r.COLUMN_NAME));
  const missing = ['inventory_captacion_pdf_url', 'inventory_colocacion_pdf_url']
    .filter((c) => !existing.has(c));

  if (missing.length === 0) {
    console.log('OK: ambas columnas ya existen en properties. Nada que hacer.');
  } else {
    console.log(`[migrate] Faltan ${missing.length} columna(s) en properties:`, missing);
    await conn.query(sql);
    console.log('OK: migración 009 aplicada.');
  }

  // Verificación post-aplicación
  const [after] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'properties'
       AND COLUMN_NAME IN ('inventory_captacion_pdf_url','inventory_colocacion_pdf_url','inventory_pdf_url')
     ORDER BY ORDINAL_POSITION`,
    [process.env.DB_NAME ?? 'inmocontrol'],
  );
  console.log('\nColumnas relacionadas con PDFs de inventario en `properties`:');
  for (const c of after) {
    console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.IS_NULLABLE === 'YES' ? ', NULL' : ''})`);
    if (c.COLUMN_COMMENT) console.log(`      ${c.COLUMN_COMMENT}`);
  }
  console.log('\nListo. `GET /api/properties/:id` ya no debería tirar 500 por columnas faltantes.');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('OK: columnas ya existían — nada que hacer.');
  } else {
    console.error('FAIL:', e.code, e.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
