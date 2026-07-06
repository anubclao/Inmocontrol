import mysql from 'mysql2/promise';
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

const c = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
});

console.log('Agregando columnas inventory_*_pdf_url a properties...');

const cols = [
  { name: 'inventory_captacion_pdf_url', type: 'VARCHAR(500) NULL' },
  { name: 'inventory_colocacion_pdf_url', type: 'VARCHAR(500) NULL' },
];

for (const col of cols) {
  try {
    await c.query(`ALTER TABLE properties ADD COLUMN ${col.name} ${col.type}`);
    console.log(`✓ ${col.name} agregada`);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log(`= ${col.name} ya existe, skip`);
    } else {
      console.error(`✗ ${col.name}: ${e.message}`);
    }
  }
}

await c.end();
console.log('Listo.');
