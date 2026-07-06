/**
 * scripts/clean-orphan-contracts.mjs
 * ============================================================================
 * Limpia los contratos huérfanos de MySQL que se crearon con la versión vieja
 * del flujo (antes del fix que crea el contrato recién al firmar el Inventario
 * de Colocación).
 *
 * USO:
 *   node scripts/clean-orphan-contracts.mjs
 *
 * El script lista primero lo que va a borrar (por seguridad) y pide
 * confirmación. Para saltarte la confirmación: `node scripts/clean-orphan-contracts.mjs --yes`.
 *
 * Después de correrlo, abrí la app, refrescá, y deberías ver 0 contratos
 * hasta que firmes un Inventario de Colocación real.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'inmocontrol',
  });

  console.log('Buscando contratos en MySQL…');

  const [rows] = await conn.query(
    `SELECT id, property_id, tenant_id, status, rent_amount,
            start_date, end_date, created_at
     FROM contracts
     ORDER BY created_at DESC`
  );

  if (rows.length === 0) {
    console.log('✓ No hay contratos. Nada que limpiar.');
    await conn.end();
    return;
  }

  console.log(`\nEncontré ${rows.length} contrato(s):\n`);
  console.table(
    rows.map((r) => ({
      id: r.id.slice(0, 8) + '…',
      property: (r.property_id ?? '').slice(0, 8) + '…',
      tenant: (r.tenant_id ?? '').slice(0, 8) + '…',
      status: r.status,
      canon: Number(r.rent_amount).toLocaleString('es-CO'),
      start: r.start_date,
      end: r.end_date,
    }))
  );

  const skipConfirm = process.argv.includes('--yes');
  if (!skipConfirm) {
    console.log('\n¿Borrarlos todos? (y/N)');
    const reply = (await new Promise((resolve) => {
      process.stdin.once('data', (d) => resolve(d.toString().trim().toLowerCase()));
    }));
    if (reply !== 'y' && reply !== 'yes') {
      console.log('Cancelado. No se borró nada.');
      await conn.end();
      return;
    }
  }

  // Borrar en orden: primero amortización/facturas/recibos/etc que tengan FK,
  // después contratos. Hoy solo hay FK directa desde amortization_rows y
  // rent_invoices. Si querés limpieza TOTAL (incluyendo recibos), pasá --deep.
  const deep = process.argv.includes('--deep');

  if (deep) {
    console.log('\nBorrando recibos, amortización y otros hijos del contrato…');
    await conn.query(`DELETE FROM amortization_rows`);
    await conn.query(`DELETE FROM rent_invoices`);
    await conn.query(`DELETE FROM rent_increases WHERE contract_id IS NOT NULL`);
    console.log('✓ Datos de billing relacionados borrados');
  } else {
    // Si hay hijos, el FK con ON DELETE CASCADE se encarga solo.
    const [[{ count: amort }]] = await conn.query(
      `SELECT COUNT(*) AS count FROM amortization_rows WHERE contract_id IS NOT NULL`
    );
    const [[{ count: invoices }]] = await conn.query(
      `SELECT COUNT(*) AS count FROM rent_invoices WHERE contract_id IS NOT NULL`
    );
    if (amort > 0 || invoices > 0) {
      console.log(
        `\n⚠️  Hay ${amort} fila(s) de amortización y ${invoices} factura(s) ` +
        `vinculadas a estos contratos. Se borrarán en cascada (FK CASCADE).`
      );
    }
  }

  const [result] = await conn.query(`DELETE FROM contracts`);
  console.log(`\n✓ ${result.affectedRows} contrato(s) eliminado(s) de MySQL.`);

  await conn.end();
  console.log('\nListo. Refrescá la app — no deberías ver contratos hasta que');
  console.log('un agente firme el Inventario de Colocación de un arrendatario.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});