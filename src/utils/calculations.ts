import type { Transaction } from '../types';

/**
 * Motor de liquidación mensual para administración de arrendamientos.
 *
 * Normatividad Colombia (vigente 2026, verificar con DIAN antes de desplegar):
 *  - IVA 19% sobre comisión de administración
 *  - GMF (4x1000) sobre el valor que se transfiere electrónicamente
 *  - Retención en la fuente sobre arrendamiento de bienes raíces
 *    (persona natural = 3.5% si canon mensual > 27 UVT; persona jurídica = 11%)
 *  - Administración PH: pasa al propietario, no genera IVA si es vivienda
 *
 * La liquidación es IDÉNTICA entre el componente LiquidacionMensual y el
 * PDF — usa la misma función `calculateMonthlySettlement` para que el cliente
 * y el documento legal nunca difieran.
 *
 * Si el sistema reporta "Activo" pero el periodo no está abierto, retornamos
 * el array vacío (no se calcula).
 */

// Constantes UVT 2026 (valor actualizado por la DIAN cada año)
export const UVT_2026 = 52_373;
export const IVA_RATE = 0.19;
export const GMF_RATE = 0.004; // 4x1000
export const RETEFUENTE_RATURAL = 0.035; // 3.5% — canon > 27 UVT
export const RETEFUENTE_RJURIDICA = 0.11;  // 11%

export const RETEFUENTE_THRESHOLD_UVT = 27;
export const RETEFUENTE_THRESHOLD_COP = RETEFUENTE_THRESHOLD_UVT * UVT_2026;

export type TenantTaxType = 'natural' | 'juridica';
export type OwnerTaxType = 'natural' | 'juridica';

export interface SettlementInputs {
  /** Canon de arrendamiento mensual (COP) */
  canon: number;
  /** Administración PH (COP) — se descuenta al propietario */
  administracionPH: number;
  /** Otros ingresos del periodo (COP) */
  otrosIngresos: number;
  /** Egresos operativos del periodo (COP) */
  gastosOperativos: number;
  /** Porcentaje de comisión de administración que cobra la inmobiliaria */
  comisionPct: number;
  /** Porcentaje de seguro (opcional, COP) */
  seguroPct: number;
  /** Tipo de contribuyente del propietario (para retefuente) */
  ownerTaxType: OwnerTaxType;
  /** Tipo de contribuyente del arrendatario (informativo, no afecta liq) */
  tenantTaxType: TenantTaxType;
  /** Periodo en formato YYYY-MM */
  period: string;
  /** Indica si el periodo ya está cerrado contablemente */
  closed: boolean;
}

export interface SettlementLine {
  key: string;
  label: string;
  amount: number;
  /** 'income' = entra al propietario; 'discount' = se descuenta; 'expense' = gasto operativo */
  category: 'income' | 'discount' | 'expense' | 'tax' | 'fee';
  /** Referencia legal para auditoría */
  legalRef?: string;
}

export interface SettlementResult {
  period: string;
  lines: SettlementLine[];
  totales: {
    ingresosBrutos: number;
    descuentosFijos: number;
    gastosOperativos: number;
    impuestos: number;
    comisiones: number;
    /** Lo que se transfiere al propietario */
    saldoTransferir: number;
  };
  /** Trazabilidad: para mostrar al usuario "de dónde salió cada número" */
  trace: {
    canon: number;
    comision: number;
    ivaSobreComision: number;
    seguro: number;
    retefuente: number;
    gmf: number;
    baseGmf: number;
    /** Indica si se aplicó retefuente (umbral) */
    retefuenteApplied: boolean;
  };
  /** Cuando closed=true, los cálculos son los definitivos */
  closed: boolean;
}

/**
 * Función pura: dados los inputs, retorna el desglose completo.
 * Sin efectos secundarios. Usada por el componente de pantalla Y el PDF.
 *
 * IMPORTANTE: todos los valores monetarios retornados están redondeados a COP
 * enteros (sin centavos). Esto es porque la liquidación mensual SIEMPRE opera
 * sobre pesos colombianos sin decimales, y un valor con centavos como
 * `135682.96` rompe el formato del PDF (mostraría "ciento treinta y cinco mil
 * seiscientos ochenta y dos pesos con 96/100" — incorrecto para COP).
 */
export function calculateMonthlySettlement(inputs: SettlementInputs): SettlementResult {
  const canon = Math.round(Math.max(0, inputs.canon));
  const admin = Math.round(Math.max(0, inputs.administracionPH));
  const otros = Math.round(Math.max(0, inputs.otrosIngresos));
  const gastos = Math.round(Math.max(0, inputs.gastosOperativos));

  // ── 1. Ingresos brutos (no incluye admin PH, eso pasa al propietario) ──
  const ingresosBrutos = canon + otros;

  // ── 2. Comisión de administración + IVA sobre la comisión ──
  const comision = Math.round(canon * (inputs.comisionPct / 100));
  const ivaSobreComision = Math.round(comision * IVA_RATE);

  // ── 3. Seguro (porcentaje sobre el canon) ──
  const seguro = Math.round(canon * (inputs.seguroPct / 100));

  // ── 4. Retención en la fuente sobre arrendamiento ──
  // Persona natural: 3.5% si canon > 27 UVT ($1,414,071 en 2026)
  // Persona jurídica: 11% siempre
  let retefuente = 0;
  let retefuenteApplied = false;
  if (inputs.ownerTaxType === 'juridica') {
    retefuente = Math.round(canon * RETEFUENTE_RJURIDICA);
    retefuenteApplied = true;
  } else if (canon > RETEFUENTE_THRESHOLD_COP) {
    retefuente = Math.round(canon * RETEFUENTE_RATURAL);
    retefuenteApplied = true;
  }

  // ── 5. Base del GMF: lo que efectivamente se mueve en la cuenta ──
  // Convención: GMF se cobra sobre el valor a transferir al propietario,
  // no sobre los ingresos brutos. Por eso la base = ingresos - descuentos fijos.
  const descuentosFijos = comision + ivaSobreComision + seguro + retefuente;
  const baseGmf = Math.max(0, ingresosBrutos - descuentosFijos);
  const gmf = Math.round(baseGmf * GMF_RATE);

  // ── 6. Saldo a transferir ──
  // Ingresos - descuentos fijos - GMF - gastos operativos
  // La administración PH se devuelve al propietario tal cual, no es gasto nuestro
  const impuestos = ivaSobreComision + retefuente;
  const comisiones = comision;
  const saldoTransferir = Math.round(Math.max(0,
    ingresosBrutos
    - descuentosFijos
    - gmf
    - gastos
    + admin // PH se devuelve íntegra
  ));

  // ── 7. Líneas para el PDF y la pantalla ──
  const lines: SettlementLine[] = [
    { key: 'canon', label: 'Canon de arrendamiento', amount: canon, category: 'income' },
    ...(otros > 0 ? [{ key: 'otros', label: 'Otros ingresos', amount: otros, category: 'income' as const }] : []),
    ...(admin > 0 ? [{ key: 'admin', label: 'Administración PH (reembolso)', amount: admin, category: 'income' as const, legalRef: 'Ley 675/2001 art. 30' }] : []),

    { key: 'comision', label: `Comisión administración (${inputs.comisionPct}%)`, amount: comision, category: 'discount' },
    { key: 'iva', label: 'IVA sobre comisión (19%)', amount: ivaSobreComision, category: 'tax', legalRef: 'ET art. 468' },
    ...(seguro > 0 ? [{ key: 'seguro', label: `Seguro (${inputs.seguroPct}%)`, amount: seguro, category: 'discount' as const }] : []),
    ...(retefuenteApplied
      ? [{ key: 'retefuente', label: `Retención en la fuente (${inputs.ownerTaxType === 'juridica' ? '11%' : '3.5%'})`, amount: retefuente, category: 'tax' as const, legalRef: 'ET art. 383' }]
      : []),
    { key: 'gmf', label: 'GMF (4x1000)', amount: gmf, category: 'fee', legalRef: 'ET art. 871' },

    ...(gastos > 0 ? [{ key: 'gastos', label: 'Gastos operativos', amount: gastos, category: 'expense' as const }] : []),
  ];

  return {
    period: inputs.period,
    lines,
    totales: {
      ingresosBrutos,
      descuentosFijos,
      gastosOperativos: gastos,
      impuestos,
      comisiones,
      saldoTransferir,
    },
    trace: {
      canon, comision, ivaSobreComision, seguro, retefuente, gmf, baseGmf, retefuenteApplied,
    },
    closed: inputs.closed,
  };
}

/**
 * Helper de compatibilidad: la función `calculateFinancials` original tenía
 * otra forma (recibía transactions[]. La dejamos para no romper el código
 * existente, pero la nueva fuente de verdad es `calculateMonthlySettlement`.
 */
export const calculateFinancials = (
  transactions: Transaction[],
  commissionPercent: number,
  insurancePercent: number,
) => {
  const rent = transactions.find((t) => t.category === 'rent')?.amount || 0;
  const adminPh = transactions.find((t) => t.category === 'admin_ph')?.amount || 0;
  const totalIncome = rent + adminPh;

  const commission = rent * (commissionPercent / 100);
  const ivaCommission = commission * IVA_RATE;
  const insurance = rent * (insurancePercent / 100);
  const fixedDiscounts = commission + ivaCommission + insurance;

  // Mantenemos la convención original (asumir transferencia del neto)
  const transferValue = totalIncome - fixedDiscounts;
  const bankFee = transferValue * GMF_RATE;
  const bankDiscounts = Math.max(0, bankFee);

  const otherDiscounts = transactions
    .filter((t) => t.type === 'expense' && !['commission', 'insurance', 'bank_fee'].includes(t.category))
    .reduce((sum, t) => sum + t.amount, 0);

  const pendingBalance = totalIncome - (fixedDiscounts + bankDiscounts + otherDiscounts);

  return {
    totalIncome,
    fixedDiscounts,
    bankDiscounts,
    otherDiscounts,
    pendingBalance,
    details: { commission, ivaCommission, insurance, bankFee },
  };
};

/** Formato de moneda COP sin decimales */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value);
};
