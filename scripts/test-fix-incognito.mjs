// Test E2E: verifica que los 3 fixes funcionan
const PROP_ID = '89dcd391-bccf-41e3-ba1c-ae1fc1ee4a03';
const BASE = 'http://localhost:3001';

let passed = 0;
let failed = 0;

const log = (ok, msg) => {
  if (ok) { passed++; console.log('  ✅', msg); }
  else    { failed++; console.log('  ❌', msg); }
};

console.log('\n=== TEST 1: PATCH datetime ISO 8601 con milliseconds ===');
try {
  // Esto era el payload que rompía antes
  const r = await fetch(`${BASE}/api/properties/${PROP_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mandateSignedAt: '2026-06-25T22:11:44.456Z',
    }),
  });
  const j = await r.json();
  log(r.ok, `PATCH devolvió ${r.status} ${JSON.stringify(j)}`);
} catch (err) {
  log(false, `PATCH falló: ${err.message}`);
}

console.log('\n=== TEST 2: PATCH con ISO 8601 sin Z ===');
try {
  const r = await fetch(`${BASE}/api/properties/${PROP_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mandateSignedAt: '2026-06-25T22:11:44.456-05:00',
    }),
  });
  log(r.ok, `PATCH devolvió ${r.status}`);
} catch (err) {
  log(false, `PATCH falló: ${err.message}`);
}

console.log('\n=== TEST 3: PATCH con formato MySQL ya ===');
try {
  const r = await fetch(`${BASE}/api/properties/${PROP_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mandateSignedAt: '2026-06-25 22:11:44',
    }),
  });
  log(r.ok, `PATCH devolvió ${r.status}`);
} catch (err) {
  log(false, `PATCH falló: ${err.message}`);
}

console.log('\n=== TEST 4: GET /api/properties/:id devuelve docs con URLs reales ===');
try {
  const r = await fetch(`${BASE}/api/properties/${PROP_ID}`);
  const j = await r.json();
  const docs = j.documents ?? {};
  const docCount = Object.keys(docs).length;
  log(docCount === 4, `4 docs en respuesta (got ${docCount})`);

  let allDriveUrls = true;
  for (const [label, url] of Object.entries(docs)) {
    if (!url.startsWith('https://drive.google.com/')) {
      allDriveUrls = false;
      console.log(`     ⚠️  ${label}: ${url.slice(0, 40)}...`);
    }
  }
  log(allDriveUrls, 'Todas las URLs son de Drive (no blob:)');

  log(!!j.mandato_pdf_url && j.mandato_pdf_url.startsWith('https://drive.google.com/'),
      `Mandato URL presente y de Drive: ${(j.mandato_pdf_url ?? '').slice(0, 40)}...`);
} catch (err) {
  log(false, `GET falló: ${err.message}`);
}

console.log('\n=== TEST 5: GET lista incluye docs por propiedad ===');
try {
  const r = await fetch(`${BASE}/api/properties`);
  const j = await r.json();
  const target = (j.properties ?? []).find(p => p.id === PROP_ID);
  log(!!target, 'Propiedad en lista');
  if (target) {
    const docCount = Object.keys(target.documents ?? {}).length;
    log(docCount === 4, `4 docs en lista (got ${docCount})`);
    log(!!target.mandato_pdf_url, `mandato_pdf_url presente en lista: ${(target.mandato_pdf_url ?? '').slice(0, 30)}...`);
  }
} catch (err) {
  log(false, `GET / falló: ${err.message}`);
}

console.log(`\n=== RESUMEN: ${passed} pasaron, ${failed} fallaron ===\n`);
process.exit(failed > 0 ? 1 : 0);