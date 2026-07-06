import mysql from 'mysql2/promise';
const c = await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.DB_PASSWORD ?? '',database:'inmocontrol'});
try {
  await c.query("ALTER TABLE properties ADD CONSTRAINT properties_chk_1 CHECK (status IN ('Pendiente','Activo','Arrendado','Inactivo'))");
  console.log('✓ CHECK constraint re-added with Spanish names');
} catch (e) {
  console.log(`Error: ${e.message}`);
}
await c.end();
