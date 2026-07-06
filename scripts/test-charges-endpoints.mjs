// Smoke test de los nuevos endpoints /api/billing/charges/*.
// Inicia el server Express en un puerto random, ejecuta las requests HTTP
// reales, y termina el proceso.
//
// Patrón: child_process spawn del server + fetch. No toca nada del server.ts
// (solo arranca en modo test con un .env.test mínimo).

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

const PORT = 3888;
const env = {
  ...process.env,
  PORT: String(PORT),
  NODE_ENV: 'development', // importante para que use api local
  // Heredar vars de DB explícitamente (por si child_process no las copy todas)
  DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.DB_PORT ?? '3306',
  DB_USER: process.env.DB_USER ?? 'root',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: process.env.DB_NAME ?? 'inmocontrol',
};

console.log(`[test-charges-endpoints] Arrancando server en puerto ${PORT}...`);
const server = spawn('node', ['--import', 'tsx', 'server.ts'], {
  env,
  stdio: ['ignore', 'inherit', 'inherit'],
});

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/health`);
      if (r.ok) {
        const j = await r.json();
        if (j?.db?.ok) return j;
      }
    } catch {}
    await wait(500);
  }
  throw new Error('Server no arrancó en 30s');
}

async function jget(path) {
  const r = await fetch(`http://localhost:${PORT}${path}`);
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
}
async function jpost(path, body) {
  const r = await fetch(`http://localhost:${PORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
}
async function jdelete(path) {
  const r = await fetch(`http://localhost:${PORT}${path}`, { method: 'DELETE' });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
}

async function main() {
  try {
    await waitForServer();
    console.log('[test-charges-endpoints] Server arriba. Probando endpoints /charges:');

    // 1. Listar cargos de la propiedad seed (via DB directa, evitando el filtro
    //    organization_id='default_org' del endpoint /properties que rompe en este seed)
    const mysqlMod = await import('mysql2/promise');
    const conn = await mysqlMod.createConnection({
      host: process.env.DB_HOST, port: +process.env.DB_PORT,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    });
    const [propRows] = await conn.query(`SELECT id FROM properties LIMIT 1`);
    await conn.end();
    const propertyId = propRows[0]?.id;
    if (!propertyId) throw new Error('No encontré propiedad seed');
    console.log(`  • propiedad seed: ${propertyId}`);

    // 2. Listar cargos actuales
    let { status, body } = await jget(`/api/billing/charges?propertyId=${encodeURIComponent(propertyId)}`);
    console.log(`  • GET /charges: ${status}, ${body.length} cargos`);
    if (status !== 200) throw new Error(`GET /charges falló: ${status}`);

    // 3. Crear un cargo de prueba (tenant)
    const testCharge = {
      id: `e2e-${Date.now()}`,
      propertyId,
      period: '2026-07',
      type: 'repair',
      description: 'Smoke E2E — cambio cerradura',
      amount: 250000,
      chargedTo: 'tenant',
      appliesToInvoice: true,
      recordedBy: 'e2e-test',
    };
    ({ status, body } = await jpost('/api/billing/charges', testCharge));
    console.log(`  • POST /charges (tenant): ${status} ${JSON.stringify(body)}`);
    if (status !== 200 || !body.ok) throw new Error(`POST /charges falló: ${status} ${JSON.stringify(body)}`);

    // 4. Listar de nuevo y verificar que aparece
    ({ status, body } = await jget(`/api/billing/charges?propertyId=${encodeURIComponent(propertyId)}&period=2026-07`));
    console.log(`  • GET /charges (period): ${status}, ${body.length} cargos en 2026-07`);
    const found = body.find((c) => c.id === testCharge.id);
    if (!found) throw new Error('Cargo recién creado no aparece');
    if (found.chargedTo !== 'tenant') throw new Error('chargedTo no se guardó OK');

    // 5. Verificar el invoice-summary (debe sumar el cargo chargedTo=tenant)
    ({ status, body } = await jget(`/api/billing/charges/invoice-summary?propertyId=${encodeURIComponent(propertyId)}&period=2026-07`));
    console.log(`  • GET /charges/invoice-summary: ${status}, total=${body.total}, count=${body.charges.length}`);
    if (body.total < 250000) throw new Error(`Invoice summary no incluyó el cargo (total=${body.total})`);

    // 6. Verificar owner-statement (NO debe contar el cargo de tenant como descuento del propietario)
    ({ status, body } = await jget(`/api/billing/owner-statement?propertyId=${encodeURIComponent(propertyId)}&period=2026-07`));
    console.log(`  • GET /owner-statement: ${status}, totalChargesToTenant=${body.totalChargesToTenant}, totalDiscounts=${body.totalDiscounts}`);
    if (body.totalChargesToTenant !== 250000) {
      throw new Error(`totalChargesToTenant esperado=250000, obtuvo=${body.totalChargesToTenant}`);
    }

    // 7. Cleanup: borrar el cargo
    ({ status, body } = await jdelete(`/api/billing/charges/${testCharge.id}`));
    console.log(`  • DELETE /charges/:id: ${status} ${JSON.stringify(body)}`);
    if (status !== 200) throw new Error(`DELETE falló: ${status}`);

    console.log('');
    console.log('=== TODOS LOS TESTS PASARON ===');
  } finally {
    server.kill('SIGINT');
    await wait(500);
    server.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
