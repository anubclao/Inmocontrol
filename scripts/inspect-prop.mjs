import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',port:3306,user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
const [cols] = await c.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='inmocontrol' AND TABLE_NAME='properties' AND COLUMN_NAME LIKE '%pdf%'");
console.log('PDF columns:', cols);
const [prop] = await c.query("SELECT id, address, status, mandato_pdf_url, inventory_pdf_url FROM properties WHERE address LIKE '%CL 149 54 16 AP 302%' LIMIT 1");
console.log('Property:', prop);
if (prop[0]) {
  const [docs] = await c.query("SELECT doc_type, file_url FROM property_documents WHERE property_id = ?", [prop[0].id]);
  console.log('Documents:', docs);
  const [inv] = await c.query("SELECT id, phase, property_id FROM inventories WHERE property_id = ?", [prop[0].id]);
  console.log('Inventories:', inv);
}
await c.end();
