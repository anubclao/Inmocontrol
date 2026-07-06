import mysql from 'mysql2/promise';
const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.DB_PASSWORD ?? '', database: 'inmocontrol'
});

console.log('=== properties columns ===');
const [cols] = await c.query("SHOW COLUMNS FROM properties");
console.log(cols.map(c => `${c.Field} | ${c.Type} | ${c.Null} | ${c.Default ?? ''}`).join('\n'));

console.log('\n=== properties rows ===');
const [props] = await c.query("SELECT * FROM properties");
console.log(JSON.stringify(props, null, 2));

console.log('\n=== property_documents columns ===');
const [dcols] = await c.query("SHOW COLUMNS FROM property_documents");
console.log(dcols.map(c => `${c.Field} | ${c.Type}`).join('\n'));

console.log('\n=== property_documents rows ===');
const [docs] = await c.query("SELECT * FROM property_documents");
console.log(JSON.stringify(docs, null, 2));

console.log('\n=== inventories columns ===');
const [icols] = await c.query("SHOW COLUMNS FROM inventories");
console.log(icols.map(c => `${c.Field} | ${c.Type} | ${c.Null} | ${c.Default ?? ''}`).join('\n'));

console.log('\n=== inventories rows ===');
const [inv] = await c.query("SELECT * FROM inventories");
console.log(JSON.stringify(inv, null, 2));

console.log('\n=== inventory_photos columns ===');
const [pcols] = await c.query("SHOW COLUMNS FROM inventory_photos");
console.log(pcols.map(c => `${c.Field} | ${c.Type}`).join('\n'));

console.log('\n=== inventory_photos rows ===');
const [photos] = await c.query("SELECT * FROM inventory_photos");
console.log(JSON.stringify(photos, null, 2));

await c.end();