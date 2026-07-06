import mysql from 'mysql2/promise';
const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.DB_PASSWORD ?? '', database: 'inmocontrol'
});
const [r] = await c.query(
  "SELECT id, address, status, mandato_pdf_url, mandato_signed_at FROM properties WHERE id = ?",
  ['89dcd391-bccf-41e3-ba1c-ae1fc1ee4a03']
);
console.log(JSON.stringify(r, null, 2));
await c.end();