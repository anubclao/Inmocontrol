import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inmocontrol',
});

console.log('Conectado a:', process.env.DB_NAME || 'inmocontrol');

// Migraciones para soportar drive_folder_path + URLs de PDFs subidos
const migrations = [
  // PROPERTIES: drive_folder_id, drive_folder_path, inventory_pdf_url
  {
    table: 'properties',
    column: 'drive_folder_id',
    sql: 'VARCHAR(200) NULL',
    after: 'mandato_signed_at',
  },
  {
    table: 'properties',
    column: 'drive_folder_path',
    sql: 'VARCHAR(500) NULL',
    after: 'drive_folder_id',
  },
  {
    table: 'properties',
    column: 'inventory_pdf_url',
    sql: 'VARCHAR(500) NULL',
    after: 'drive_folder_path',
  },
  {
    table: 'properties',
    column: 'inventory_captacion_pdf_url',
    sql: 'VARCHAR(500) NULL',
    after: 'inventory_pdf_url',
  },
  {
    table: 'properties',
    column: 'inventory_colocacion_pdf_url',
    sql: 'VARCHAR(500) NULL',
    after: 'inventory_captacion_pdf_url',
  },
  {
    table: 'properties',
    column: 'property_type',
    sql: 'VARCHAR(30) NULL',
    after: 'address',
  },
  // TENANTS: drive_folder_path
  {
    table: 'tenants',
    column: 'drive_folder_path',
    sql: 'VARCHAR(500) NULL',
    after: 'tenant_drive_folder_id',
  },
];

for (const m of migrations) {
  const [existing] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.DB_NAME || 'inmocontrol', m.table, m.column],
  );
  if (existing.length > 0) {
    console.log(`SKIP (ya existe): ${m.table}.${m.column}`);
    continue;
  }
  try {
    await conn.query(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.sql} AFTER ${m.after}`);
    console.log(`OK agregado: ${m.table}.${m.column}`);
  } catch (e) {
    console.log(`ERROR ${m.table}.${m.column}:`, e.message.substring(0, 100));
  }
}

await conn.end();
console.log('Done');