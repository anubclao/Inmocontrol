import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',port:3306,user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
const [props] = await c.query("SELECT id, address, status, mandato_pdf_url IS NOT NULL as has_mandato, inventory_pdf_url IS NOT NULL as has_inv_pdf FROM properties ORDER BY created_at DESC");
for (const p of props) {
  const [docs] = await c.query("SELECT COUNT(*) as n FROM property_documents WHERE property_id = ?", [p.id]);
  const [inv] = await c.query("SELECT COUNT(*) as n, MAX(phase) as phase FROM inventories WHERE property_id = ?", [p.id]);
  console.log(`${p.address} | status=${p.status} | mandato=${p.has_mandato?'Y':'N'} | inv_pdf=${p.has_inv_pdf?'Y':'N'} | docs_in_db=${docs[0].n} | inventories=${inv[0].n} (${inv[0].phase||'-'})`);
}
await c.end();
