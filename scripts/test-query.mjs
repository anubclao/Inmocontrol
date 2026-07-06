import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
try {
  const [r] = await c.query("SELECT id, address, inventario_captacion_pdf_url FROM properties WHERE id = '89dcd391-bccf-41e3-ba1c-ae1fc1ee4a03'");
  console.log('OK:', r);
} catch (e) {
  console.error('ERROR:', e.message);
}
await c.end();
