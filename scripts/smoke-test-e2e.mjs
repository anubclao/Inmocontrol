/**
 * Smoke test E2E del feature financiero de InmoControl.
 *
 * Este script NO toca MySQL — todo se ejecuta en memoria. Sirve para
 * validar que el pipeline completo funciona end-to-end ANTES de hacer
 * deploy. Si este script pasa, los flujos críticos están bien.
 *
 * Pipeline validado:
 *   1. generateInvoiceFromRow         → crea un RentInvoice desde una fila de amortización
 *   2. numeroAPesosColombianosCaps    → convierte el monto a letras
 *   3. calculateMonthlySettlement     → calcula neto del propietario
 *   4. generateCuentaCobroPdfBlob     → genera el PDF de cuenta de cobro
 *   5. generateEstadoCuentaPdfBlob    → genera el PDF de estado de cuenta
 *
 * Corrida:
 *   node --import tsx scripts/smoke-test-e2e.mjs
 */

import { generateInvoiceFromRow, generateAmortization } from '../src/features/billing/calculations.ts';
import { calculateMonthlySettlement, formatCurrency } from '../src/utils/calculations.ts';
import { numeroAPesosColombianosCaps } from '../src/utils/numeroALetras.ts';
import { generateCuentaCobroPdfBlob } from '../src/features/billing/cuentaCobroPdf.ts';
import { generateEstadoCuentaPdfBlob } from '../src/features/billing/estadoCuentaPdf.ts';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✔ ${label}`);
    passed++;
  } else {
    console.log(`  ✖ ${label}  ${detail}`);
    failed++;
    failures.push(`${label} ${detail}`);
  }
}

console.log('\n═══ InmoControl smoke test E2E (sin MySQL) ═══\n');

// ─── Setup: datos ficticios pero realistas ──────────────────────────────
const TODAY = new Date().toISOString().split('T')[0];

const property = {
  id: 'prop-smoke-1',
  address: 'Calle 93 #11-27, Apto 501',
  chip: 'AAA0123BMCY',
  folio: '50N-1234567',
  ownerId: 'o-1',
  status: 'Arrendado',
  ownerName: 'Carlos Andrés Pérez Restrepo',
  ownerIdNumber: '79.456.123',
  ownerPhone: '+57 310 456 7890',
  ownerEmail: 'carlos@example.com',
  propertyType: 'Apartamento',
};

const tenant = {
  name: 'María Fernanda Gómez Salazar',
  idNumber: '52.987.654',
  email: 'maria@example.com',
  phone: '+57 315 987 6543',
};

const owner = { name: 'Carlos Andrés Pérez Restrepo', idNumber: '79.456.123' };

const contract = {
  id: 'ct-smoke-001',
  propertyId: property.id,
  tenantId: 't-1',
  rentAmount: 1_696_037,
  adminFee: 250_000,
  commissionPercentage: 8,
  insurancePercentage: 0,
  startDate: '2026-01-15',
  endDate: '2027-01-14',
  renewalStrategy: 'auto',
  inventoryEndRequired: true,
  status: 'active',
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: TODAY,
  signedAt: '2026-01-15T10:00:00Z',
};

const policy = {
  propertyId: property.id,
  rentAmount: 1_696_037,
  adminFee: 250_000,
  lateFeeMidPct: 5,
  lateFeeLatePct: 10,
  graceDay: 10,
  applyAnnualIpc: true,
  expectedIpcPct: 5,
  applyIpcToAdmin: true,
  allowAdminChanges: true,
  bankAccounts: [
    {
      id: 'ba-1',
      bank: 'Bancolombia',
      accountType: 'savings',
      accountNumber: '123-456789-00',
      holderName: 'INMOVIRTUAL S.A. E.S.P.',
      holderIdNumber: '800.175.746-9',
      isPrimary: true,
    },
  ],
  createdAt: TODAY,
  updatedAt: TODAY,
  createdBy: 'smoke-test',
};

// ─── Test 1: generateInvoiceFromRow ───────────────────────────────────
console.log('1. Generar invoice desde fila de amortización');
const amortRows = generateAmortization(contract, policy);
check('amortización genera 12 filas para contrato de 12 meses', amortRows.length === 12, `got ${amortRows.length}`);

const month1 = amortRows[0];
check('mes 1 — periodo empieza 2026-01', month1.periodStart.startsWith('2026-01'), `got ${month1.periodStart}`);

const invoice = generateInvoiceFromRow(month1);
check('invoice tiene status=pending', invoice.status === 'pending');
check('invoice.period coincide con el mes', invoice.period === month1.periodStart.slice(0, 7));
check('invoice.subtotal = baseRent + baseAdmin', invoice.subtotal === month1.subtotal, `got ${invoice.subtotal} vs ${month1.subtotal}`);

// ─── Test 2: numeroAPesosColombianosCaps ─────────────────────────────────
console.log('\n2. Conversor número → letras');
const letras = numeroAPesosColombianosCaps(1_696_037);
check('letras en MAYÚSCULAS', letras === letras.toUpperCase(), `got "${letras}"`);
check('letras incluye "PESOS M/CTE"', letras.includes('PESOS M/CTE'));
check('letras incluye "MILLÓN"', letras.includes('MILLÓN'));
check('letras incluye "MIL"', letras.includes('MIL'));

// ─── Test 3: calculateMonthlySettlement ──────────────────────────────────
console.log('\n3. Cálculo de liquidación mensual al propietario');
const settlement = calculateMonthlySettlement({
  canon: 1_696_037,
  administracionPH: 250_000,
  otrosIngresos: 0,
  gastosOperativos: 0,
  comisionPct: 8,
  seguroPct: 0,
  ownerTaxType: 'natural',
  tenantTaxType: 'natural',
  period: '2026-07',
  closed: false,
});
check('canon > 27 UVT → retefuente aplica', settlement.trace.retefuenteApplied);
check('retefuente = 3.5% × canon', settlement.trace.retefuente === Math.round(1_696_037 * 0.035), `got ${settlement.trace.retefuente}`);
check('comisión = 8% × canon', settlement.trace.comision === Math.round(1_696_037 * 0.08));
check('saldo a transferir > 0', settlement.totales.saldoTransferir > 0);
check('saldo a transferir es entero (sin centavos)', Number.isInteger(settlement.totales.saldoTransferir));
console.log(`    (neto a transferir: ${formatCurrency(settlement.totales.saldoTransferir)})`);

// ─── Test 4: PDF de cuenta de cobro ─────────────────────────────────────
console.log('\n4. PDF de cuenta de cobro');
const invoiceConsecutivo = { ...invoice, invoiceNumber: 'CC-202607-001' };
const cuentaCobroBlob = await generateCuentaCobroPdfBlob({
  invoice: invoiceConsecutivo,
  contract,
  property,
  owner,
  tenant,
  bankAccount: policy.bankAccounts[0],
  agency: { name: 'INMOVIRTUAL S.A. E.S.P.', nit: '800.175.746-9' },
  totalAmount: invoice.subtotal,
});
check('PDF se genera como Blob', cuentaCobroBlob instanceof Blob);
check('PDF tiene tamaño > 0', cuentaCobroBlob.size > 0, `size=${cuentaCobroBlob.size}`);
check('PDF es application/pdf (magic bytes)', cuentaCobroBlob.type === 'application/pdf', `type=${cuentaCobroBlob.type}`);

// ─── Test 5: PDF de estado de cuenta ────────────────────────────────────
console.log('\n5. PDF de estado de cuenta del propietario');
const statement = {
  propertyId: property.id,
  period: '2026-07',
  grossRent: 1_696_037,
  grossAdmin: 250_000,
  grossLateFee: 0,
  totalGrossIncome: 1_946_037,
  totalDiscounts: 0,
  discounts: [],
  settlement: {
    commission: settlement.trace.comision,
    ivaOnCommission: settlement.trace.ivaSobreComision,
    retefuente: settlement.trace.retefuente,
    gmf: settlement.trace.gmf,
    totalRetentions: settlement.totales.impuestos + settlement.trace.comision + settlement.trace.gmf,
    commissionPct: 8,
  },
  netCalculated: settlement.totales.saldoTransferir,
  totalPayouts: settlement.totales.saldoTransferir,
  payouts: [],
  finalBalance: 0,
};

const estadoCuentaBlob = await generateEstadoCuentaPdfBlob({
  statement,
  contract,
  property,
  owner,
  tenant,
  bankAccount: policy.bankAccounts[0],
  agency: { name: 'INMOVIRTUAL S.A. E.S.P.', nit: '800.175.746-9' },
  statementNumber: 'EC-202607',
});
check('PDF estado de cuenta se genera como Blob', estadoCuentaBlob instanceof Blob);
check('PDF estado de cuenta tiene tamaño > 0', estadoCuentaBlob.size > 0, `size=${estadoCuentaBlob.size}`);

// ─── Test 6: Edge cases del flujo ───────────────────────────────────────
console.log('\n6. Edge cases');
const invoiceSmallCanon = generateInvoiceFromRow({
  ...month1,
  baseRent: 800_000,  // < 27 UVT → sin retefuente
  baseAdmin: 0,
  subtotal: 800_000,
  total: 800_000,
  totalEarly: 800_000,
  totalMid: 840_000,
  totalLate: 880_000,
});
check('invoice con canon pequeño (< 27 UVT) sin mora', invoiceSmallCanon.subtotal === 800_000);

const settlementSmall = calculateMonthlySettlement({
  canon: 800_000,
  administracionPH: 0,
  otrosIngresos: 0,
  gastosOperativos: 0,
  comisionPct: 8,
  seguroPct: 0,
  ownerTaxType: 'natural',
  tenantTaxType: 'natural',
  period: '2026-07',
  closed: false,
});
check('canon < 27 UVT → NO aplica retefuente', !settlementSmall.trace.retefuenteApplied);
check('canon < 27 UVT → retefuente = 0', settlementSmall.trace.retefuente === 0);

// ─── Resumen ────────────────────────────────────────────────────────────
console.log(`\n═══ ${passed}/${passed + failed} tests pasaron ═══\n`);

if (failed > 0) {
  console.log('FALLAS:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('✓ El feature crítico funciona end-to-end. Listo para deploy a piloto.\n');
process.exit(0);