// Sube retroactivamente las 4 fotos del inventario al Drive.
import { config } from 'dotenv';
config({ path: '.env.local' });
import mysql from 'mysql2/promise';

const PROPERTY_ID = '068f442a-e685-4a81-aac2-259c8c35d7f0';
const PROPERTY_ADDRESS = 'CL 145 76 55 T1 AP 202';

const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.DB_PASSWORD ?? '', database: 'inmocontrol'
});

const [invRows] = await c.query(
  `SELECT id, photos FROM inventories WHERE property_id = ? AND phase = 'inicial' LIMIT 1`,
  [PROPERTY_ID],
);

if (!invRows.length) {
  console.log('No hay inventario inicial');
  await c.end();
  process.exit(1);
}

const photos = typeof invRows[0].photos === 'string' ? JSON.parse(invRows[0].photos) : invRows[0].photos;
console.log(`Fotos en MySQL: ${photos.length}`);

const payload = {
  propertyId: PROPERTY_ID,
  phase: 'inicial',
  photos: photos.map((p) => {
    const areaSlug = String(p.areaId ?? '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const name = `${areaSlug}_${String(p.id).split(':').pop() ?? '00'}.jpg`;
    return { name, base64Data: p.dataUrl };
  }),
};

console.log(`Subiendo ${payload.photos.length} fotos a Drive...`);

const res = await fetch('http://localhost:3001/api/inventories/upload-photos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const result = await res.json();
console.log('Status:', res.status);
console.log('Uploaded:', result.uploaded?.length ?? 0);
console.log('Failed:', result.failed?.length ?? 0);
if (result.uploaded) {
  for (const u of result.uploaded) console.log(`  ✓ ${u.name} → ${u.fileId}`);
}
if (result.failed) {
  for (const f of result.failed) console.log(`  ✗ ${f.name}: ${f.error}`);
}

await c.end();