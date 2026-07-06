import mysql from 'mysql2/promise';
const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.DB_PASSWORD ?? '', database: 'inmocontrol'
});
const [r] = await c.query(
  `SELECT COLUMN_NAME, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA='inmocontrol' AND TABLE_NAME='inventories' AND COLUMN_NAME IN ('id','property_id')`
);
console.log(r);
await c.end();