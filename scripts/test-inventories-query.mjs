// Replicate exactly what the GET handler does, with full error capture.
import mysql from 'mysql2/promise';
const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.DB_PASSWORD ?? '', database: 'inmocontrol'
});
try {
  const [rows] = await c.query(
    `SELECT id, property_id, contract_id, phase, property_type, counters, areas, photos,
            signatures, custom_areas, signed_at, created_at, updated_at
     FROM inventories
     WHERE property_id = ?
     ORDER BY created_at DESC`,
    ['068f442a-e685-4a81-aac2-259c8c35d7f0'],
  );
  console.log('rows:', rows.length);
  for (const r of rows) {
    console.log(`  - ${r.id} phase=${r.phase} photos_count=${(r.photos ?? []).length} photos_size=${JSON.stringify(r.photos ?? []).length}`);
  }
} catch (err) {
  console.error('ERROR:', err.message);
  console.error(err.stack);
}
await c.end();