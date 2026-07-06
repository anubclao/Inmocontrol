import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
const [constraints] = await c.query("SELECT CONSTRAINT_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='inmocontrol' AND CONSTRAINT_NAME LIKE 'properties%'");
console.log('Constraints:', constraints);
await c.end();
