/**
 * InmoControl — Cálculos de Billing
 * ============================================================================
 * Funciones puras (sin React, sin I/O) que calculan:
 *  - Tabla de amortización
 *  - Mora según día de pago
 *  - Aplicación de descuentos al propietario
 *  - Aplicación de aumentos al inquilino
 *  - Estado de cuenta
 *
 * Estas funciones son el corazón del módulo de facturación. Cualquier UI
 * (hoy en localStorage, mañana en backend) las consume.
 */

import type {
  AmortizationRow,
  BillingPolicy,
  Contract,
  InvoiceChargesSummary,
  PropertyCharge,
  PropertyDiscount,
  RentIncrease,
  AccountStatement,
  RentInvoice,
} from './types';
import { addMonth, chargeToDiscount, genId, monthsBetween, toPeriod } from './types';

// ─── Mora ──────────────────────────────────────────────────────────────

export interface LateFeeParams {
  subtotal: number;
  paidOnDayOfMonth: number;        // día del mes en que se pagó (1-31)
  graceDay: number;                 // ej: 10
  lateFeeMidPct: number;            // ej: 5 (% si paga entre 11-20)
  lateFeeLatePct: number;           // ej: 10 (% si paga entre 21-30/31)
}

export interface LateFeeResult {
  /** % aplicado (0 si pagó a tiempo). */
  pct: number;
  /** Monto de la mora en pesos. */
  amount: number;
  /** Tramo: 'early' | 'mid' | 'late' (tarde pero no vencido) | 'expired'. */
  bucket: 'early' | 'mid' | 'late' | 'expired';
}

/**
 * Calcula la mora según el día de pago. Si el día es <= graceDay, no hay
 * mora. Si es entre graceDay+1 y 20, se aplica lateFeeMidPct. De 21 en
 * adelante, lateFeeLatePct. Si pasó el mes (>=31 o día del mes siguiente),
 * se considera expired (mora = lateFeeLatePct + posible reporte a cartera).
 */
export function calculateLateFee(p: LateFeeParams): LateFeeResult {
  const { subtotal, paidOnDayOfMonth, graceDay, lateFeeMidPct, lateFeeLatePct } = p;
  if (subtotal <= 0 || paidOnDayOfMonth <= 0) {
    return { pct: 0, amount: 0, bucket: 'early' };
  }
  if (paidOnDayOfMonth <= graceDay) {
    return { pct: 0, amount: 0, bucket: 'early' };
  }
  if (paidOnDayOfMonth <= 20) {
    const pct = lateFeeMidPct;
    return { pct, amount: Math.round((subtotal * pct) / 100), bucket: 'mid' };
  }
  if (paidOnDayOfMonth <= 31) {
    const pct = lateFeeLatePct;
    return { pct, amount: Math.round((subtotal * pct) / 100), bucket: 'late' };
  }
  // Después del mes
  const pct = lateFeeLatePct;
  return { pct, amount: Math.round((subtotal * pct) / 100), bucket: 'expired' };
}

// ─── Amortización ──────────────────────────────────────────────────────

/** Genera la tabla de amortización de un contrato. */
export function generateAmortization(
  contract: Pick<Contract, 'id' | 'propertyId' | 'startDate' | 'endDate' | 'rentAmount' | 'adminFee'>,
  policy: Pick<BillingPolicy, 'propertyId' | 'rentAmount' | 'adminFee' | 'lateFeeMidPct' | 'lateFeeLatePct' | 'graceDay' | 'applyAnnualIpc' | 'expectedIpcPct' | 'allowAdminChanges' | 'applyIpcToAdmin'>,
  options: {
    /** Aumentos a aplicar (cambios de admin, IPC). */
    increases?: RentIncrease[];
  } = {}
): AmortizationRow[] {
  const months = monthsBetween(contract.startDate, contract.endDate);
  const rows: AmortizationRow[] = [];
  const increases = options.increases ?? [];
  // Se aplica IPC cada 12 meses, empezando al mes 13
  const ipcEveryMonths = 12;

  for (let m = 1; m <= months; m++) {
    const periodStart = addMonth(toPeriod(contract.startDate), m - 1) + '-01';
    // El último día del mes
    const periodEnd = endOfMonth(periodStart);

    // Canon y admin base del mes (pueden haber sido incrementados por IPC)
    const ipcApplied = policy.applyAnnualIpc && m > 1 && (m - 1) % ipcEveryMonths === 0;
    const ipcFactor = ipcApplied ? 1 + (policy.expectedIpcPct || 0) / 100 : 1;
    const baseRent = Math.round((policy.rentAmount || contract.rentAmount) * (ipcApplied && policy.applyIpcToAdmin === false ? 1 : ipcFactor));
    const baseAdmin = Math.round((policy.adminFee || contract.adminFee) * ipcFactor);

    // Ajustes por cambios de administración o IPC registrados
    const monthIncreases = increases.filter((inc) => inc.effectiveFrom <= toPeriod(periodStart));
    const adminAdjustment = monthIncreases
      .filter((inc) => inc.type === 'admin_change')
      .reduce((sum, inc) => sum + inc.amount, 0);

    const subtotal = baseRent + baseAdmin + adminAdjustment;

    // Cálculo de mora: 0 (el cliente va a actualizar paidOnDayOfMonth al pagar)
    const totalEarly = subtotal;
    const totalMid = subtotal + Math.round((subtotal * (policy.lateFeeMidPct || 0)) / 100);
    const totalLate = subtotal + Math.round((subtotal * (policy.lateFeeLatePct || 0)) / 100);

    rows.push({
      id: genId('amort-'),
      propertyId: contract.propertyId,
      contractId: contract.id,
      monthNumber: m,
      periodStart,
      periodEnd,
      dueDate: `${toPeriod(periodStart)}-${String(Math.min(policy.graceDay, 28)).padStart(2, '0')}`,
      baseRent,
      baseAdmin,
      adminAdjustment: adminAdjustment || (ipcApplied && policy.applyIpcToAdmin ? baseAdmin - (policy.adminFee || 0) : 0),
      ipcAdjustment: ipcApplied ? subtotal - (policy.rentAmount + policy.adminFee) : 0,
      subtotal,
      appliedLateFeePct: 0,
      lateFeeAmount: 0,
      paidOnDayOfMonth: null,
      total: subtotal,
      totalEarly,
      totalMid,
      totalLate,
      status: 'pending',
    });
  }
  return rows;
}

/** Calcula el "total" final de una fila cuando se conoce el día de pago. */
export function applyPaymentToRow(row: AmortizationRow, paidOnDayOfMonth: number, policy: BillingPolicy): AmortizationRow {
  const fee = calculateLateFee({
    subtotal: row.subtotal,
    paidOnDayOfMonth,
    graceDay: policy.graceDay,
    lateFeeMidPct: policy.lateFeeMidPct,
    lateFeeLatePct: policy.lateFeeLatePct,
  });
  return {
    ...row,
    paidOnDayOfMonth,
    appliedLateFeePct: fee.pct,
    lateFeeAmount: fee.amount,
    total: row.subtotal + fee.amount,
    status: 'paid',
    paidAt: new Date().toISOString(),
  };
}

// ─── Estado de cuenta del propietario ────────────────────────────────

/**
 * Genera el estado de cuenta del propietario para un período.
 * = ingresos brutos del mes - descuentos del mes.
 *
 * Acepta la lista legacy `PropertyDiscount[]` por compatibilidad con la
 * versión anterior. Internamente los trata igual que un `PropertyCharge`
 * con `chargedTo='owner'`. Si vienen `PropertyCharge[]`, también los
 * acepta — útil para el flujo nuevo unificado.
 */
export function calculateAccountStatement(
  propertyId: string,
  period: string,
  grossIncome: number,
  discountsOrCharges: Array<PropertyDiscount | PropertyCharge>,
): AccountStatement {
  const periodsMatch = (d: PropertyDiscount | PropertyCharge) =>
    'monthPeriod' in d ? d.monthPeriod === period : d.period === period;

  // Mapeo a una forma común para filtrar/normalizar.
  const discountCandidates: Array<{ amount: number; kind: 'discount' | 'charge'; chargedTo?: any; raw: PropertyDiscount | PropertyCharge }> =
    discountsOrCharges.filter(periodsMatch).map((d) => {
      if ('chargedTo' in d) {
        // PropertyCharge → solo descuento si chargedTo IN ('owner','both').
        const applies = d.chargedTo === 'owner' || d.chargedTo === 'both';
        return { amount: applies ? d.amount : 0, kind: 'charge' as const, chargedTo: d.chargedTo, raw: d };
      }
      return { amount: d.amount, kind: 'discount' as const, raw: d };
    });

  const applicable = discountCandidates.filter((c) => c.amount > 0);
  const totalDiscounts = applicable.reduce((sum, c) => sum + c.amount, 0);

  // Los detalles que se devuelven al UI mantienen el formato legacy
  // (PropertyDiscount) para no romper BillingPanel ni EstadoCuentaView.
  const discounts: PropertyDiscount[] = applicable.map((c) =>
    'monthPeriod' in c.raw ? c.raw as PropertyDiscount : chargeToDiscount(c.raw as PropertyCharge),
  );

  return {
    propertyId,
    period,
    grossIncome,
    totalDiscounts,
    netIncome: Math.max(0, grossIncome - totalDiscounts),
    discounts,
  };
}

// ─── Cuenta de cobro al inquilino ─────────────────────────────────────

/** Genera la cuenta de cobro para un mes a partir de una fila de amortización. */
export function generateInvoiceFromRow(row: AmortizationRow, options?: { paymentLink?: string; notes?: string }): RentInvoice {
  return {
    id: genId('inv-'),
    propertyId: row.propertyId,
    contractId: row.contractId,
    period: toPeriod(row.periodStart),
    dueDate: row.dueDate,
    subtotal: row.subtotal,
    totalEarly: row.totalEarly,
    totalMid: row.totalMid,
    totalLate: row.totalLate,
    status: 'pending',
    paymentLink: options?.paymentLink,
    notes: options?.notes,
  };
}

// ─── Cargos extra al inquilino (PropertyCharge → CC) ───────────────────

/**
 * Suma los cargos del mes que aplican a la cuenta de cobro del inquilino.
 *
 * Reglas:
 *   - Solo cuentan cargos con `chargedTo IN ('tenant','both')`.
 *   - Solo cuentan cargos con `appliesToInvoice = true`.
 *   - Devuelve el detalle para imprimir en el PDF "Otros cargos del mes".
 *
 * El subtotal total a cobrar al inquilino se calcula:
 *   subtotalCC = subtotalBase (canon + admin) + chargesTotal.
 */
export function summarizeInvoiceCharges(
  propertyId: string,
  period: string,
  charges: PropertyCharge[]
): InvoiceChargesSummary {
  const applicable = charges.filter(
    (c) =>
      c.period === period &&
      c.propertyId === propertyId &&
      c.appliesToInvoice &&
      (c.chargedTo === 'tenant' || c.chargedTo === 'both'),
  );
  const total = applicable.reduce((s, c) => s + c.amount, 0);
  return { propertyId, period, total, charges: applicable };
}

// ─── Helpers de fecha ──────────────────────────────────────────────────

/** Devuelve el último día del mes de una fecha 'YYYY-MM-DD'. */
function endOfMonth(dateISO: string): string {
  const [y, m] = dateISO.split('-').map(Number);
  const d = new Date(y, m, 0); // día 0 del mes siguiente = último día del mes actual
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
