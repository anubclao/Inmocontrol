// Reset: borra la propiedad de prueba + inventario + documentos + mandato de MySQL.
// NO toca Drive (eso lo hace force-cleanup con --skip-drive=false después).
import mysql from 'mysql2/promise';

const PROP_ID = '89dcd391-bccf-41e3-ba1c-ae1fc1ee4a03';
const PROP_ADDRESS = 'CL 149 54 16 AP 302';

const c = await mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: 'inmocontrol',
});

console.log(`Reseteando propiedad ${PROP_ID} (${PROP_ADDRESS})...`);

const [inv] = await c.query('SELECT id, phase FROM inventories WHERE property_id = ?', [PROP_ID]);
console.log(`  Inventarios encontrados: ${inv.length}`);
for (const i of inv) console.log(`    - ${i.id} ${i.phase}`);

const safeDel = async (sql, params = []) => {
  try { await c.query(sql, params); }
  catch (e) { console.log(`    (skip: ${e.code ?? e.message.slice(0, 60)})`); }
};
await safeDel('DELETE FROM inventory_items WHERE inventory_id IN (SELECT id FROM inventories WHERE property_id = ?)', [PROP_ID]);
await safeDel('DELETE FROM inventory_photos WHERE inventory_id IN (SELECT id FROM inventories WHERE property_id = ?)', [PROP_ID]);
await safeDel('DELETE FROM inventories WHERE property_id = ?', [PROP_ID]);
await safeDel('DELETE FROM property_documents WHERE property_id = ?', [PROP_ID]);
await safeDel('DELETE FROM tenant_documents WHERE property_id = ?', [PROP_ID]);
await safeDel('DELETE FROM tenants WHERE property_id = ?', [PROP_ID]);
await safeDel('DELETE FROM properties WHERE id = ?', [PROP_ID]);

console.log(`  Propiedad + inventario + documentos eliminados de MySQL`);

const [check] = await c.query('SELECT COUNT(*) as n FROM properties WHERE id = ?', [PROP_ID]);
console.log(`  Filas restantes en properties para ese id: ${check[0].n}`);

await c.end();