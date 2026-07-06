// Wipe: borra la propiedad de prueba + inventario + documentos + mandato.
// NO toca Drive (eso lo hace force-cleanup con --skip-drive=false).
import mysql from 'mysql2/promise';

const PROP_ID = '89dcd391-bccf-41e3-ba1c-ae1fc1ee4a03';
const PROP_ADDRESS = 'CL 149 54 16 AP 302';

const c = await mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: 'inmocontrol',
});

console.log(`Wiping property ${PROP_ID} (${PROP_ADDRESS})...`);

// 1. Inventarios asociados
const [inv] = await c.query('SELECT id, phase, name FROM inventories WHERE property_id = ?', [PROP_ID]);
console.log(`  Inventories: ${inv.length}`);
for (const i of inv) console.log(`    - ${i.id} ${i.phase} ${i.name ?? ''}`);

// Borrar tablas con FK (en orden de dependencias)
await c.query('DELETE FROM inventory_items WHERE inventory_id IN (SELECT id FROM inventories WHERE property_id = ?)', [PROP_ID]);
await c.query('DELETE FROM inventory_photos WHERE inventory_id IN (SELECT id FROM inventories WHERE property_id = ?)', [PROP_ID]);
await c.query('DELETE FROM inventories WHERE property_id = ?', [PROP_ID]);
await c.query('DELETE FROM property_documents WHERE property_id = ?', [PROP_ID]);
await c.query('DELETE FROM tenant_documents WHERE property_id = ?', [PROP_ID]).catch(() => { /* table might not exist */ });
await c.query('DELETE FROM tenants WHERE property_id = ?', [PROP_ID]).catch(() => {});
await c.query('DELETE FROM properties WHERE id = ?', [PROP_ID]);

console.log(`  ✓ property + inventory + docs deleted from MySQL`);

// Verify
const [check] = await c.query('SELECT COUNT(*) as n FROM properties WHERE id = ?', [PROP_ID]);
console.log(`  Remaining rows: ${check[0].n}`);

await c.end();