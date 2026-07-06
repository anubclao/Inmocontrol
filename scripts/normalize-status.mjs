import mysql from 'mysql2/promise';
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

const c = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
});

console.log('1. Reemplazando CHECK constraint properties_chk_1...');
try {
  await c.query('ALTER TABLE properties DROP CHECK properties_chk_1');
  console.log('  ✓ CHECK constraint eliminada');
} catch (e) {
  console.log(`  = ya estaba eliminada: ${e.message}`);
}

try {
  await c.query(`ALTER TABLE properties ADD CONSTRAINT properties_chk_1 CHECK (status IN ('Pendiente','Activo','Arrendado','Inactivo'))`);
  console.log('  ✓ Nueva CHECK constraint (Spanish names) agregada');
} catch (e) {
  console.log(`  = ya existe la nueva: ${e.message}`);
}

console.log('\n2. Normalizando statuses legacy (available/rented/maintenance → Spanish)...');
const MAP = {
  available: 'Pendiente',
  rented: 'Arrendado',
  maintenance: 'Inactivo',
  inactive: 'Inactivo',
};
for (const [from, to] of Object.entries(MAP)) {
  const [r] = await c.query('UPDATE properties SET status = ? WHERE status = ?', [to, from]);
  console.log(`  ${from} -> ${to}: ${r.affectedRows} rows`);
}

await c.end();
console.log('\nListo.');

