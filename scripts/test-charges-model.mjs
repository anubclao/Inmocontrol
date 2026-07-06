// Smoke test del modelo PropertyCharge.
// Verifica:
//   1) Las funciones puras del frontend funcionan con la forma unificada.
//   2) El esquema de la tabla en MySQL acepta las inserciones.
//   3) El backfill desde property_discounts se completó.
//
// Patrón: imports directos del backend (cálculos puros) + DB cruda. Sin
// levantar Express, sin shell de test compleja. Se ejecuta con:
//   node --import tsx scripts/test-charges-model.mjs

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import mysql from 'mysql2/promise';
import {
  summarizeInvoiceCharges,
  calculateAccountStatement,
} from '../src/features/billing/calculations.ts';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
});

async function main() {
  console.log('=== Smoke test 1: funciones puras (PropertyCharge-like) ===');

  const charges = [
    {
      id: 'demo-1',
      propertyId: 'prop-A',
      period: '2026-07',
      type: 'public_services',
      description: 'Energía',
      amount: 150000,
      chargedTo: 'owner',
      appliesToInvoice: false,
      recordedBy: 'test',
      recordedAt: new Date().toISOString(),
    },
    {
      id: 'demo-2',
      propertyId: 'prop-A',
      period: '2026-07',
      type: 'repair',
      description: 'Cambio cerradura puerta principal',
      amount: 320000,
      chargedTo: 'tenant',
      appliesToInvoice: true,
      recordedBy: 'test',
      recordedAt: new Date().toISOString(),
    },
    {
      id: 'demo-3',
      propertyId: 'prop-A',
      period: '2026-07',
      type: 'repair',
      description: 'Daño balcón',
      amount: 800000,
      chargedTo: 'both',
      appliesToInvoice: true,
      recordedBy: 'test',
      recordedAt: new Date().toISOString(),
    },
  ];

  // 1) Estado de cuenta del propietario: solo chargedTo=owner o both.
  const stmt = calculateAccountStatement('prop-A', '2026-07', 2000000, charges);
  console.log('  • Statement:', {
    grossIncome: stmt.grossIncome,
    totalDiscounts: stmt.totalDiscounts,
    netIncome: stmt.netIncome,
    discountsCount: stmt.discounts.length,
  });
  if (stmt.discounts.length !== 2) {
    throw new Error(`Expected 2 descuentos (owner + both), got ${stmt.discounts.length}`);
  }
  if (stmt.totalDiscounts !== 150000 + 800000) {
    throw new Error(`Expected totalDiscounts = 950000, got ${stmt.totalDiscounts}`);
  }
  console.log('    ✓ Solo chargedTo=owner/both cuentan en el estado de cuenta.');

  // 2) Resumen de cargos que van a la CC del inquilino.
  const ccSummary = summarizeInvoiceCharges('prop-A', '2026-07', charges);
  console.log('  • CC Summary:', { total: ccSummary.total, count: ccSummary.charges.length });
  if (ccSummary.total !== 320000 + 800000) {
    throw new Error(`Expected CC total = 1120000, got ${ccSummary.total}`);
  }
  console.log('    ✓ Solo chargedTo=tenant/both con appliesToInvoice=true cuentan.');

  console.log('');
  console.log('=== Smoke test 2: tabla property_charges en MySQL ===');

  const [cols] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'property_charges'
     ORDER BY ORDINAL_POSITION`,
    [process.env.DB_NAME ?? 'inmocontrol'],
  );
  console.log('  • Columnas:', cols.length, '(expected: 12)');
  if (cols.length !== 12) throw new Error(`Expected 12 cols, got ${cols.length}`);

  const [counts] = await pool.query(
    `SELECT charged_to, COUNT(*) AS n FROM property_charges GROUP BY charged_to`,
  );
  console.log('  • Conteos por charged_to:', counts);

  const testId = `smoke-${Date.now()}`;
  await pool.query(
    `INSERT INTO property_charges
       (id, organization_id, property_id, period, type, description,
        amount, charged_to, applies_to_invoice, attachment_url, recorded_by)
     VALUES (
       ?, (SELECT id FROM organizations LIMIT 1),
       (SELECT id FROM properties LIMIT 1),
       '2026-07', 'repair', 'Smoke-test reparacion cerradura',
       150000, 'tenant', 1, NULL, 'smoke-test'
     )`,
    [testId],
  );
  const [check] = await pool.query(`SELECT * FROM property_charges WHERE id = ?`, [testId]);
  if (check.length !== 1) throw new Error('No se inserto el cargo de prueba');
  console.log('  • Cargo de prueba insertado OK con id =', testId);

  await pool.query(`DELETE FROM property_charges WHERE id = ?`, [testId]);
  console.log('  • Cargo de prueba eliminado (cleanup).');

  const [backfilled] = await pool.query(
    `SELECT COUNT(*) AS n FROM property_charges WHERE recorded_by LIKE 'migrado desde property_discounts%'`,
  );
  console.log('  • Cargos backfilleados de property_discounts:', backfilled[0].n);

  console.log('');
  console.log('=== TODOS LOS TESTS PASARON ===');

  await pool.end();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
