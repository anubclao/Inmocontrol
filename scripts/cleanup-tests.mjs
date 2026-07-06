import mysql from 'mysql2/promise';
const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.DB_PASSWORD ?? '', database: 'inmocontrol'
});
const [r] = await c.query(
  "DELETE FROM properties WHERE owner_name LIKE 'Test Owner%' OR address LIKE 'TEST Callee%'"
);
console.log('Deleted', r.affectedRows, 'test properties');
const [d] = await c.query(
  "DELETE FROM property_documents WHERE property_id NOT IN (SELECT id FROM properties)"
);
console.log('Cleaned', d.affectedRows, 'orphan property_documents');
await c.end();
