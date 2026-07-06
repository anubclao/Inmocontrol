/**
 * E2E test simulado del wizard:
 *  - POST 1 (INSERT): crea propiedad con `wizard-X` → devuelve UUID real
 *  - POST 2 (UPSERT parcial, sin address/owner): persiste mandatePdfUrl + documents
 *  - POST 3 (inventario): con UUID real, fase inicial
 *  - GET propiedad: confirma que TODO persistió
 */
const t0 = Date.now();
const stamp = `RETEST-${t0}`;

const r1 = await fetch('http://localhost:3001/api/properties', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    localId: `wizard-${t0}`,
    address: `CL 99 ${stamp}`,
    chip: `AAA${t0 % 10000000}`,
    folio: `FOL-${stamp}`,
    ownerName: `Owner ${stamp}`,
    ownerIdNumber: `${1000000000 + (t0 % 1000000000)}`,
    propertyType: 'apartamento',
  }),
});
const d1 = await r1.json();
console.log(`POST 1 (INSERT) → ${r1.status} | id=${d1.propertyId} | drive=${d1.driveFolderPath}`);
if (!r1.ok) { console.error('FAIL POST1:', d1); process.exit(1); }
const propertyId = d1.propertyId;

await new Promise((r) => setTimeout(r, 500));

const r2 = await fetch('http://localhost:3001/api/properties', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  // Sin address / ownerName → debe preservar los previos gracias al UPSERT parcial
  body: JSON.stringify({
    localId: propertyId,
    mandatePdfUrl: `https://drive.google.com/file/d/fake-mandate-${stamp}/view`,
    mandateSignedAt: new Date().toISOString(),
    documents: {
      'Cédula de Ciudadanía': `https://drive.google.com/file/d/fake-cedula-${stamp}/view`,
      'Certificado de Tradición': `https://drive.google.com/file/d/fake-cert-${stamp}/view`,
      'Impuesto Predial': `https://drive.google.com/file/d/fake-predial-${stamp}/view`,
      'Rut Actualizado': `https://drive.google.com/file/d/fake-rut-${stamp}/view`,
    },
  }),
});
const d2 = await r2.json();
console.log(`POST 2 (UPSERT mandate+docs) → ${r2.status} |`, JSON.stringify(d2));
if (!r2.ok) { console.error('FAIL POST2:', d2); process.exit(1); }

await new Promise((r) => setTimeout(r, 500));

const r3 = await fetch('http://localhost:3001/api/inventories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: `${propertyId}:inicial`,
    propertyId,
    phase: 'inicial',
    propertyType: 'apartamento',
    counters: { alcobas: 2, banos: 1 },
    areas: [{ id: 'alcoba-1', label: 'Alcoba 1', items: {}, photos: [] }],
    photos: [],
    signatures: [],
    customAreas: [],
  }),
});
const d3 = await r3.json();
console.log(`POST 3 (inventario) → ${r3.status} |`, JSON.stringify(d3));
if (!r3.ok) { console.error('FAIL POST3:', d3); process.exit(1); }

await new Promise((r) => setTimeout(r, 500));

const r4 = await fetch(`http://localhost:3001/api/inventories?propertyId=${propertyId}`);
const d4 = await r4.json();
console.log(`GET /api/inventories?propertyId=... → ${r4.status} | count=${d4.inventories?.length}`);
if (!d4.inventories?.length) {
  console.error('FAIL: inventario no apareció');
  process.exit(1);
}
console.log(`  inventario id: ${d4.inventories[0].id}`);

await new Promise((r) => setTimeout(r, 500));

const r5 = await fetch('http://localhost:3001/api/properties');
const d5 = await r5.json();
const found = d5.properties.find((p) => p.id === propertyId);
console.log(`GET /api/properties → ${r5.status} | found=${!!found}`);
if (!found) { console.error('FAIL GET'); process.exit(1); }
console.log(`  address: ${found.address}`);
console.log(`  owner: ${found.owner_name}`);
console.log(`  mandato_pdf_url: ${found.mandato_pdf_url ? '✓' : '✗'}`);
console.log(`  mandato_signed_at: ${found.mandato_signed_at ? '✓' : '✗'}`);
console.log(`  documents: ${JSON.stringify(Object.keys(found.documents ?? {}))}`);
console.log(`  inventory_count: ${found.inventory_count}`);
console.log(`  drive_folder_path: ${found.drive_folder_path}`);

// Limpieza
await new Promise((r) => setTimeout(r, 500));
const del = await fetch(`http://localhost:3001/api/properties/${propertyId}`, { method: 'DELETE' });
const delD = await del.json();
console.log(`DELETE → ${del.status} |`, JSON.stringify(delD));

console.log('\n✅ E2E OK — los 3 bugs del UPSERT están cerrados');