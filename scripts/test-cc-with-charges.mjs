// Smoke test del flujo completo: cargo chargedTo='tenant' → invoice.send →
// el subtotal de la rent_invoices debe aumentar.
//
// Patrón: arranco server + curl real.

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import 'dotenv/config';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
dotenv.config({ path: '.env.local', override: true });

const PORT = 3889;
const env = {
  ...process.env,
  PORT: String(PORT),
  NODE_ENV: 'development',
  DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.DB_PORT ?? '3306',
  DB_USER: process.env.DB_USER ?? 'root',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: process.env.DB_NAME ?? 'inmocontrol',
};

const server = spawn('node', ['--import', 'tsx', 'server.ts'], { env, stdio: ['ignore', 'inherit', 'inherit'] });

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
  throw new Error('Server no arrancó');
}

async function jpost(path, body) {
  const r = await fetch(`http://localhost:${PORT}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function main() {
  try {
    await waitForServer();

    const conn = await mysql.createConnection({
      host: process.env.DB_HOST, port: +process.env.DB_PORT,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    });

    // Buscar la primera amortización de la propiedad seed
    const [propRows] = await conn.query(`SELECT id FROM properties LIMIT 1`);
    const propertyId = propRows[0].id;
    const [amortRows] = await conn.query(`
      SELECT id, property_id, contract_id,
             DATE_FORMAT(period_start, '%Y-%m') AS period,
             subtotal
      FROM amortization_rows
      WHERE property_id = ?
      ORDER BY period_start ASC
      LIMIT 1`, [propertyId]);
    const amort = amortRows[0];
    if (!amort) throw new Error('No hay amortización seed');
    const period = amort.period;
    const subtotalBase = Number(amort.subtotal);

    console.log(`[test-cc-with-charges] propiedad=${propertyId}, mes=${period}, subtotal_base=${subtotalBase}`);

    // 1. Resetear invoice (puede haber sido creada antes)
    await conn.query(`DELETE FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [amort.contract_id, period]);

    // 2. Crear un cargo chargedTo=tenant, appliesToInvoice=true, por 150000
    const chargeId = `cc-test-${Date.now()}`;
    const chargeResp = await jpost('/api/billing/charges', {
      id: chargeId, propertyId, period,
      type: 'repair', description: 'CC test - daño cerradura',
      amount: 150000, chargedTo: 'tenant', appliesToInvoice: true,
      recordedBy: 'cc-test',
    });
    console.log(`  • Cargo creado: ${chargeResp.status}`);
    if (chargeResp.status !== 200) throw new Error('Cargo no creado');

    // 3. POST /api/billing/invoices/send
    const sendResp = await jpost('/api/billing/invoices/send', {
      propertyId, contractId: amort.contract_id, period,
    });
    console.log(`  • invoice/send: ${sendResp.status}, subtotal=${sendResp.body?.subtotal}`);
    if (sendResp.status !== 200) throw new Error('invoice/send falló');

    const subtotalFinal = Number(sendResp.body?.subtotal ?? 0);
    const expectedSubtotal = subtotalBase + 150000;
    if (subtotalFinal !== expectedSubtotal) {
      throw new Error(`Subtotal esperado ${expectedSubtotal}, obtuvo ${subtotalFinal}`);
    }

    console.log(`  ✓ Subtotal de la CC incluye el cargo al inquilino: ${subtotalBase} + 150000 = ${subtotalFinal}`);

    // 4. Validar también en DB
    const [inv] = await conn.query(`SELECT subtotal FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [amort.contract_id, period]);
    const dbSubtotal = Number(inv[0]?.subtotal ?? 0);
    if (dbSubtotal !== subtotalFinal) {
      throw new Error(`Subtotal en DB (${dbSubtotal}) != API response (${subtotalFinal})`);
    }

    console.log('');
    console.log('=== TODOS LOS TESTS PASARON ===');

    // Cleanup
    await conn.query(`DELETE FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [amort.contract_id, period]);
    await conn.query(`DELETE FROM property_charges WHERE id = ?`, [chargeId]);
    await conn.end();
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
