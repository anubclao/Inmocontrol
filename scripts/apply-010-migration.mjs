// Aplica la migración 010 (property_owners + property_units +
// property_documents.owner_id/unit_id + migración de datos legacy).
// Idempotente: si las tablas/columnas ya existen, no hace nada. Si las
// propiedades ya tienen filas en property_owners, no duplica.
//
// Aplicar contra Hostinger:  copiá este script + el SQL al proyecto, después:
//   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... node scripts/apply-010-migration.mjs
//
// O más fácil: pegá el SQL en phpMyAdmin → pestaña SQL.

import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'db', 'mysql', 'migrations', '010_property_owners_and_units.sql');
const sql = readFileSync(sqlPath, 'utf-8');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  multipleStatements: true,
});

const dbName = process.env.DB_NAME ?? 'inmocontrol';

try {
  // Pre-check: ¿ya existen las tablas y columnas?
  const [tables] = await conn.query<any[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('property_owners','property_units')`,
    [dbName],
  );
  const existingTables = new Set(tables.map((r) => r.TABLE_NAME));

  const [cols] = await conn.query<any[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'property_documents'
       AND COLUMN_NAME IN ('owner_id','unit_id')`,
    [dbName],
  );
  const existingCols = new Set(cols.map((r) => r.COLUMN_NAME));

  const needOwnersTable = !existingTables.has('property_owners');
  const needUnitsTable = !existingTables.has('property_units');
  const needOwnerCol = !existingCols.has('owner_id');
  const needUnitCol = !existingCols.has('unit_id');

  if (!needOwnersTable && !needUnitsTable && !needOwnerCol && !needUnitCol) {
    console.log('OK: tablas y columnas ya existen. Migración ya aplicada. Corriendo solo el INSERT legacy por si quedó algo pendiente...');
  } else {
    console.log('[migrate] Faltan:', {
      property_owners: needOwnersTable,
      property_units: needUnitsTable,
      property_documents_owner_id: needOwnerCol,
      property_documents_unit_id: needUnitCol,
    });
    await conn.query(sql);
    console.log('OK: migración 010 aplicada.');
  }

  // Verificación post-aplicación
  const [ownerCols] = await conn.query<any[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'property_owners'
     ORDER BY ORDINAL_POSITION`,
    [dbName],
  );
  console.log('\n📋 Columnas de `property_owners`:');
  for (const c of ownerCols) {
    console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.IS_NULLABLE === 'YES' ? ', NULL' : ''})`);
    if (c.COLUMN_COMMENT) console.log(`      ${c.COLUMN_COMMENT}`);
  }

  const [unitCols] = await conn.query<any[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'property_units'
     ORDER BY ORDINAL_POSITION`,
    [dbName],
  );
  console.log('\n📋 Columnas de `property_units`:');
  for (const c of unitCols) {
    console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.IS_NULLABLE === 'YES' ? ', NULL' : ''})`);
    if (c.COLUMN_COMMENT) console.log(`      ${c.COLUMN_COMMENT}`);
  }

  const [docCols] = await conn.query<any[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'property_documents'
       AND COLUMN_NAME IN ('owner_id','unit_id')
     ORDER BY ORDINAL_POSITION`,
    [dbName],
  );
  console.log('\n📋 Nuevas columnas de `property_documents`:');
  for (const c of docCols) {
    console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.IS_NULLABLE === 'YES' ? ', NULL' : ''})`);
  }

  // Stats finales
  const [stats] = await conn.query<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM property_owners) AS total_owners,
       (SELECT COUNT(DISTINCT property_id) FROM property_owners) AS properties_with_owners,
       (SELECT COUNT(*) FROM properties) AS total_properties`,
  );
  console.log('\n📊 Estadísticas:');
  console.log(`  - Total propiedades: ${stats[0].total_properties}`);
  console.log(`  - Propiedades con al menos 1 owner: ${stats[0].properties_with_owners}`);
  console.log(`  - Total filas en property_owners: ${stats[0].total_owners}`);

  const sinOwner = Number(stats[0].total_properties) - Number(stats[0].properties_with_owners);
  if (sinOwner > 0) {
    console.log(`  ⚠️  ${sinOwner} propiedad(es) sin fila en property_owners (probablemente sin owner_name legacy).`);
  } else {
    console.log('  ✅ Todas las propiedades con owner_name ya tienen al menos un owner.');
  }

  console.log('\nListo. La app ya puede leer/escribir property_owners + property_units.');
} catch (e) {
  if (e.code === 'ER_DUP_ENTRY' || e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_FK_DUP_NAME') {
    console.log('OK: la migración ya estaba aplicada (algunos objetos ya existían).');
  } else {
    console.error('FAIL:', e.code, e.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
