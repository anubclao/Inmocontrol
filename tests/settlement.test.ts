/**
 * Tests del motor financiero — liquidación mensual al propietario.
 *
 * CRÍTICOS: este motor calcula cuánto se le transfiere al propietario cada
 * mes. Un bug aquí es plata que se transfiere de más o de menos. NO
 * modifiques `calculateMonthlySettlement` sin actualizar estos tests.
 *
 * Corrida:
 *   node --test --import tsx tests/settlement.test.ts
 *   o
 *   npx tsx --test tests/settlement.test.ts
 *
 * Cobertura:
 *   - Persona natural con canon < 27 UVT → no aplica retefuente
 *   - Persona natural con canon > 27 UVT → aplica 3.5%
 *   - Persona jurídica → aplica 11% siempre
 *   - Comisión + IVA sobre comisión (19%) correctos
 *   - GMF (4x1000) sobre la base correcta
 *   - Administración PH pasa íntegra al propietario
 *   - Gastos operativos se descuentan del saldo a transferir
 *   - Saldo a transferir nunca es negativo
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlySettlement,
  UVT_2026,
  RETEFUENTE_THRESHOLD_COP,
  RETEFUENTE_THRESHOLD_UVT,
} from '../src/utils/calculations';

const UVT_27 = UVT_2026 * 27; // = 1_414_071 COP (2026)
const UVT_28 = UVT_2026 * 28; // 1_466_444

const baseInputs = {
  canon: 1_696_037,            // canon típico de un apartamento en Bogotá 2026
  administracionPH: 250_000,  // administración PH del conjunto
  otrosIngresos: 0,
  gastosOperativos: 0,
  comisionPct: 8,
  seguroPct: 0,
  ownerTaxType: 'natural' as const,
  tenantTaxType: 'natural' as const,
  period: '2026-07',
  closed: false,
};

test('regression: 1.696.037 COP canon > 27 UVT → retefuente 3.5%', () => {
  const result = calculateMonthlySettlement(baseInputs);
  // 1.696.037 > 1.414.071 (27 UVT) → aplica 3.5%
  assert.equal(result.trace.retefuenteApplied, true, 'retefuente debe aplicar');
  assert.equal(result.trace.retefuente, Math.round(1_696_037 * 0.035), 'retefuente = 3.5% del canon');
  // comisión = 8% × canon = 135.683
  assert.equal(result.trace.comision, Math.round(1_696_037 * 0.08));
  // IVA sobre comisión = 19% × 135.683 = 25.780
  assert.equal(result.trace.ivaSobreComision, Math.round(Math.round(1_696_037 * 0.08) * 0.19));
});

test('regression: canon 1.000.000 COP < 27 UVT → NO aplica retefuente', () => {
  const result = calculateMonthlySettlement({ ...baseInputs, canon: 1_000_000 });
  assert.equal(result.trace.retefuenteApplied, false, 'retefuente NO debe aplicar');
  assert.equal(result.trace.retefuente, 0);
});

test('regression: canon justo en 27 UVT (1.414.071) → NO aplica retefuente', () => {
  // El threshold es estricto > (no >=), así que en el límite exacto NO aplica
  const result = calculateMonthlySettlement({ ...baseInputs, canon: UVT_27 });
  assert.equal(result.trace.retefuenteApplied, false);
  assert.equal(result.trace.retefuente, 0);
});

test('regression: canon 1.414.072 (1 peso arriba del umbral) → SÍ aplica', () => {
  const result = calculateMonthlySettlement({ ...baseInputs, canon: UVT_27 + 1 });
  assert.equal(result.trace.retefuenteApplied, true);
  assert.equal(result.trace.retefuente, Math.round((UVT_27 + 1) * 0.035));
});

test('regression: persona jurídica → retefuente 11% siempre (sin importar monto)', () => {
  const juridica = { ...baseInputs, canon: 500_000, ownerTaxType: 'juridica' as const };
  const result = calculateMonthlySettlement(juridica);
  // 500.000 < 27 UVT pero al ser jurídica aplica 11%
  assert.equal(result.trace.retefuenteApplied, true);
  assert.equal(result.trace.retefuente, Math.round(500_000 * 0.11));
});

test('regression: GMF (4x1000) sobre base correcta = ingresos - descuentos fijos', () => {
  const result = calculateMonthlySettlement(baseInputs);
  const baseGmf = 1_696_037 - result.trace.comision - result.trace.ivaSobreComision - result.trace.retefuente - result.trace.seguro;
  // GMF se calcula sobre baseGmf (Math.max(0, ...) por si los descuentos superan ingresos)
  assert.equal(result.trace.baseGmf, Math.max(0, baseGmf));
  assert.equal(result.trace.gmf, Math.round(result.trace.baseGmf * 0.004));
});

test('regression: administración PH pasa íntegra al propietario', () => {
  const result = calculateMonthlySettlement({ ...baseInputs, administracionPH: 250_000 });
  // La admin PH NO genera IVA ni comisión. Va directo al saldo.
  // Saldo = canon + admin - comisión - ivaSobreComision - retefuente - gmf
  const expected = Math.max(0,
    1_696_037 + 250_000
    - result.trace.comision - result.trace.ivaSobreComision
    - result.trace.retefuente - result.trace.gmf,
  );
  assert.equal(result.totales.saldoTransferir, expected);
});

test('regression: gastos operativos se restan del saldo a transferir', () => {
  const sinGastos = calculateMonthlySettlement({ ...baseInputs, gastosOperativos: 0 });
  const conGastos = calculateMonthlySettlement({ ...baseInputs, gastosOperativos: 150_000 });
  // El saldo debe ser exactamente 150.000 menos con gastos
  assert.equal(sinGastos.totales.saldoTransferir - conGastos.totales.saldoTransferir, 150_000);
});

test('regression: saldoTransferir nunca es negativo', () => {
  // Caso patológico: gastos enormes + canon pequeño + muchos descuentos
  const result = calculateMonthlySettlement({
    ...baseInputs,
    canon: 500_000,
    administracionPH: 0,
    gastosOperativos: 10_000_000, // más que el canon
    comisionPct: 8,
  });
  assert.ok(result.totales.saldoTransferir >= 0, 'saldoTransferir no puede ser negativo');
});

test('regression: totales.ingresosBrutos = canon + otrosIngresos (admin NO)', () => {
  const result = calculateMonthlySettlement({ ...baseInputs, otrosIngresos: 100_000 });
  // Ingresos brutos NO incluyen la administración PH (esa se devuelve íntegra)
  assert.equal(result.totales.ingresosBrutos, 1_696_037 + 100_000);
});

test('regression: descuentosFijos = comisión + ivaSobreComision + seguro + retefuente', () => {
  const result = calculateMonthlySettlement(baseInputs);
  const expected = result.trace.comision + result.trace.ivaSobreComision + result.trace.seguro + result.trace.retefuente;
  assert.equal(result.totales.descuentosFijos, expected);
});

test('regression: impuestos = ivaSobreComision + retefuente (GMF va aparte)', () => {
  const result = calculateMonthlySettlement(baseInputs);
  // impuestos NO incluye GMF (ese es 4x1000, no impuesto propiamente)
  assert.equal(result.totales.impuestos, result.trace.ivaSobreComision + result.trace.retefuente);
});

test('regression: comisiones = solo comision (sin IVA)', () => {
  const result = calculateMonthlySettlement(baseInputs);
  assert.equal(result.totales.comisiones, result.trace.comision);
});

test('regression: trace.canon siempre es el input canon (inmutable)', () => {
  const result = calculateMonthlySettlement({ ...baseInputs, canon: 2_000_000 });
  assert.equal(result.trace.canon, 2_000_000);
});

test('regression: constantes UVT 2026', () => {
  // UVT_2026 según DIAN = 52.373 COP (Resolución 000194 de 2025)
  assert.equal(UVT_2026, 52_373);
  assert.equal(RETEFUENTE_THRESHOLD_UVT, 27);
  assert.equal(RETEFUENTE_THRESHOLD_COP, 27 * 52_373);
  assert.equal(RETEFUENTE_THRESHOLD_COP, 1_414_071);
});

test('regression: ejemplo completo del README — canon 1.696.037 + admin 250.000', () => {
  // Este caso es el que aparece en el PDF de muestra y en el README.
  // Sirve como guard: si cambia el cálculo, este test detecta desviaciones.
  const result = calculateMonthlySettlement(baseInputs);
  // canon + admin - comisión(8%) - ivaSobreComision(19%) - retefuente(3.5%) - gmf(4x1000)
  const expectedComision = Math.round(1_696_037 * 0.08);            // 135.683
  const expectedIva = Math.round(expectedComision * 0.19);            // 25.780
  const expectedRetefuente = Math.round(1_696_037 * 0.035);          // 59.361
  const baseGmf = Math.max(0, 1_696_037 - expectedComision - expectedIva - expectedRetefuente);
  const expectedGmf = Math.round(baseGmf * 0.004);
  const expectedSaldo = Math.max(0, 1_696_037 + 250_000 - expectedComision - expectedIva - expectedRetefuente - expectedGmf);

  assert.equal(result.trace.comision, expectedComision);
  assert.equal(result.trace.ivaSobreComision, expectedIva);
  assert.equal(result.trace.retefuente, expectedRetefuente);
  assert.equal(result.trace.gmf, expectedGmf);
  assert.equal(result.totales.saldoTransferir, expectedSaldo);
});