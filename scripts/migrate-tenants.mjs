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

console.log('Conectado a:', process.env.DB_HOST || '127.0.0.1', '/', process.env.DB_NAME || 'inmocontrol');

// Lista de columnas que necesitamos agregar
const columns = [
  { name: 'rent', sql: 'DECIMAL(14,2) NULL' },
  { name: 'lease_start_date', sql: 'DATE NULL' },
  { name: 'status', sql: "VARCHAR(20) NOT NULL DEFAULT 'Activo'" },
  { name: 'tenant_drive_folder_id', sql: 'VARCHAR(200) NULL' },
  { name: 'updated_at', sql: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
];

// Primero verificar cuáles ya existen
const [existing] = await conn.query(
  "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tenants'",
  [process.env.DB_NAME || 'inmocontrol'],
);
const existingNames = new Set(existing.map((row) => row.COLUMN_NAME));
console.log('Columnas existentes:', [...existingNames].join(', '));

// Agregar las que faltan
for (const col of columns) {
  if (existingNames.has(col.name)) {
    console.log(`SKIP (ya existe): ${col.name}`);
    continue;
  }
  try {
    await conn.query(`ALTER TABLE tenants ADD COLUMN ${col.name} ${col.sql}`);
    console.log(`OK agregado: ${col.name}`);
  } catch (e) {
    console.log(`ERROR ${col.name}:`, e.message.substring(0, 100));
  }
}

await conn.end();
console.log('Done');