import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
const [cols] = await c.query("SHOW COLUMNS FROM properties WHERE Field='status'");
console.log('status col:', cols);
const [sample] = await c.query("SELECT DISTINCT status FROM properties");
console.log('Distinct status values in DB:', sample);
await c.end();
