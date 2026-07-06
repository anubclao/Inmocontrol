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

// Orden de borrado: primero las tablas hoja (sin FKs salientes), luego las padres
// Desactivamos FK_CHECKS temporalmente para permitir DELETE/TRUNCATE
const tables = [
  'amortization_rows',
  'rent_invoices',
  'rent_increases',
  'property_discounts',
  'policies',
  'billing_policies',
  'bank_accounts',
  'inventory_photos', // si existe
  'inventories',
  'financial_records',
  'contracts',
  'property_actions',
  'property_documents',
  'property_owners',
  'tenants',
  'properties',
  'user_oauth_tokens',
  'profiles',
  'organizations',
];

console.log('Desactivando foreign key checks...');
await conn.query('SET FOREIGN_KEY_CHECKS = 0');

for (const table of tables) {
  try {
    const [exists] = await conn.query(
      `SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
      [process.env.DB_NAME || 'inmocontrol', table],
    );
    if (exists[0].c === 0) {
      console.log(`SKIP (no existe): ${table}`);
      continue;
    }
    await conn.query(`TRUNCATE TABLE ${table}`);
    console.log(`OK truncate: ${table}`);
  } catch (e) {
    console.log(`ERROR ${table}:`, e.message.substring(0, 100));
  }
}

console.log('Reactivando foreign key checks...');
await conn.query('SET FOREIGN_KEY_CHECKS = 1');

// Re-crear filas default
console.log('Re-creando organization + profile default...');
await conn.query(
  `INSERT INTO organizations (id, name, nit) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE name = VALUES(name)`,
  ['default_org', 'InmoControl Demo', '900.123.456-7'],
);
await conn.query(
  `INSERT INTO profiles (id, organization_id, display_name, email, role)
   VALUES (?, ?, ?, ?, 'admin')
   ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
  ['default_profile', 'default_org', 'Admin Demo', 'admin@inmocontrol.demo'],
);

await conn.end();
console.log('\nListo. Tablas limpias + org default recreada.');