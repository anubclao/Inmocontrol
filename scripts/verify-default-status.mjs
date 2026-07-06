import mysql from 'mysql2/promise';
const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.DB_PASSWORD ?? '', database: 'inmocontrol'
});
const [rows] = await c.query("SELECT id, address, status, owner_name FROM properties WHERE address = 'TEST CALLE 123'");
console.log('Properties in DB:');
console.log(JSON.stringify(rows, null, 2));

// Cleanup test row
await c.query("DELETE FROM properties WHERE address = 'TEST CALLE 123'");
console.log('✓ Test row deleted');
await c.end();