import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
const [dbs] = await c.query("SELECT DATABASE() as db, CONNECTION_ID() as conn_id, @@hostname as host, @@version as ver");
console.log('Connection:', dbs);
const [props] = await c.query("SHOW DATABASES");
console.log('Databases:', props);
// Show all columns of properties
const [cols] = await c.query("SHOW FULL COLUMNS FROM properties");
const names = cols.map(c => c.Field);
console.log('All cols of properties:', names);
console.log('Has inventario_captacion_pdf_url?', names.includes('inventario_captacion_pdf_url'));
console.log('Has inventory_captacion_pdf_url?', names.includes('inventory_captacion_pdf_url'));
await c.end();
