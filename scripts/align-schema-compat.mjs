/**
 * Alinea el schema actual de MySQL con `db/mysql/schema-completo.sql`.
 *
 * Por qué existe: la DB puede tener tablas de un `schema.sql` viejo (pre-Fase 8/9/10/11).
 * Las migraciones incrementales 002-006 asumen el schema completo. Este script
 * detecta columnas faltantes y las agrega con ALTER TABLE idempotente.
 *
 * NO dropea nada. NO modifica datos. Solo agrega columnas con default sensato.
 *
 * Corrida:
 *   node scripts/align-schema-compat.mjs
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  waitForConnections: true,
  connectionLimit: 2,
});

/**
 * Mapa de columnas que necesitamos asegurar existen. Formato:
 *   table → [{ column, typeDef, defaultExpr }]
 *
 * `defaultExpr` se ejecuta en el ALTER; usar DEFAULT <expr> si queremos que
 * la nueva columna tenga un valor por default para filas existentes.
 */
const COLUMNS_TO_ENSURE = [
  // Migración 004: rent_invoices.invoice_number
  { table: 'rent_invoices', column: 'invoice_number', typeDef: 'VARCHAR(20) NULL', after: 'id' },
  // Migración 006: profiles.password_hash
  { table: 'profiles', column: 'password_hash', typeDef: 'VARCHAR(255) NULL' },

  // Schema completo — columnas que pueden faltar vs schema.sql viejo
  { table: 'properties', column: 'property_type', typeDef: 'VARCHAR(30) NULL' },
  { table: 'properties', column: 'drive_folder_id', typeDef: 'VARCHAR(200) NULL' },
  { table: 'properties', column: 'drive_folder_path', typeDef: 'VARCHAR(500) NULL' },
  { table: 'properties', column: 'inventory_pdf_url', typeDef: 'VARCHAR(500) NULL' },

  { table: 'tenants', column: 'admin_fee', typeDef: 'DECIMAL(14,2) NULL' },

  { table: 'contracts', column: 'commission_pct', typeDef: 'DECIMAL(5,2) NOT NULL DEFAULT 8', default: '8' },
  { table: 'contracts', column: 'insurance_pct', typeDef: 'DECIMAL(5,2) NOT NULL DEFAULT 0', default: '0' },
  { table: 'contracts', column: 'notice_date', typeDef: 'DATE NULL' },
  { table: 'contracts', column: 'renewal_strategy', typeDef: "VARCHAR(10) NOT NULL DEFAULT 'manual'", default: "'manual'" },
  { table: 'contracts', column: 'inventory_end_required', typeDef: 'TINYINT(1) NOT NULL DEFAULT 1', default: '1' },
  { table: 'contracts', column: 'notes', typeDef: 'TEXT NULL' },
  { table: 'contracts', column: 'contract_pdf_url', typeDef: 'VARCHAR(500) NULL' },
  { table: 'contracts', column: 'signed_at', typeDef: 'DATETIME NULL' },
  { table: 'contracts', column: 'created_by', typeDef: 'VARCHAR(36) NULL' },
  { table: 'profiles', column: 'created_by', typeDef: 'VARCHAR(36) NULL' },
  { table: 'bank_accounts', column: 'created_by', typeDef: 'VARCHAR(36) NULL' },
  { table: 'policies', column: 'created_by', typeDef: 'VARCHAR(36) NULL' },
  { table: 'inventories', column: 'created_by', typeDef: 'VARCHAR(36) NULL' },
  { table: 'property_documents', column: 'uploaded_by', typeDef: 'VARCHAR(36) NULL' },
  { table: 'financial_records', column: 'created_by', typeDef: 'VARCHAR(36) NULL' },
  { table: 'tenants', column: 'created_by', typeDef: 'VARCHAR(36) NULL' },
];

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].n) > 0;
}

async function addColumn(spec) {
  const exists = await columnExists(spec.table, spec.column);
  if (exists) return false;
  const afterClause = spec.after ? ` AFTER \`${spec.after}\`` : '';
  const sql = `ALTER TABLE \`${spec.table}\` ADD COLUMN \`${spec.column}\` ${spec.typeDef}${afterClause}`;
  console.log(`[align] ALTER ${spec.table}: ADD ${spec.column} ${spec.typeDef}`);
  await pool.query(sql);
  return true;
}

async function main() {
  console.log(`[align] DB: ${process.env.DB_HOST ?? '127.0.0.1'}:${process.env.DB_PORT ?? 3306}/${process.env.DB_NAME ?? 'inmocontrol'}\n`);
  let added = 0;
  for (const spec of COLUMNS_TO_ENSURE) {
    try {
      const did = await addColumn(spec);
      if (did) added++;
    } catch (err) {
      console.error(`[align] ERROR ${spec.table}.${spec.column}: ${err.message}`);
    }
  }
  console.log(`\n[align] Listo. ${added} columnas agregadas, ${COLUMNS_TO_ENSURE.length - added} ya existían.`);

  // Verificación final
  console.log('\n[align] Tablas presentes:');
  const [tables] = await pool.query(`SHOW TABLES`);
  console.log(`  ${tables.length} tablas (esperado ≥ 23)`);

  await pool.end();
}

main().catch((err) => {
  console.error('[align] FAILED:', err.message);
  process.exit(1);
});