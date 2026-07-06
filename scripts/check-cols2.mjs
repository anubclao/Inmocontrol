import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
const [cols] = await c.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='inmocontrol' AND TABLE_NAME='properties' AND COLUMN_NAME LIKE '%inventory%'");
console.log('Inventory-related columns:', cols);
const [prop] = await c.query("SELECT id, address, inventory_captacion_pdf_url, inventory_pdf_url FROM properties ORDER BY created_at DESC LIMIT 3");
console.log('Latest 3 props with PDF urls:');
for (const p of prop) {
  console.log(`  ${p.address}`);
  console.log(`    inventory_pdf_url: ${p.inventory_pdf_url}`);
  console.log(`    inventory_captacion_pdf_url: ${p.inventory_captacion_pdf_url}`);
}
await c.end();
