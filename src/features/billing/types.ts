/**
 * InmoControl — Modelo de Datos: Billing & Amortización
 * ============================================================================
 * Este archivo define TODAS las entidades del sistema de facturación,
 * estado de cuenta, amortización, descuentos, aumentos e histórico.
 *
 * Decisiones de diseño:
 *  - Las fechas son ISO strings (YYYY-MM-DD para fechas puras, ISO 8601 para timestamps).
 *  - Los montos monetarios son `number` en pesos colombianos (sin decimales).
 *  - Los IDs son strings (UUIDs cuando se enchufe el backend).
 *  - El log de acciones es APPEND-ONLY: nunca se borran, solo se agregan.
 *  - El histórico se preserva aunque la propiedad se archive.
 *
 * Cuando se conecte el backend (Fase 5), estos tipos se quedan IGUALES
 * — solo cambia la implementación del API client stub.
 */

// ─── Bancos y cuentas ─────────────────────────────────────────────────

/** Bancos principales de Colombia. Se usa como selector al parametrizar. */
export const COLOMBIAN_BANKS = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Banco Popular',
  'Banco Caja Social',
  'Banco Agrario',
  'Banco AV Villas',
  'Banco Falabella',
  'Banco Pichincha',
  'Banco GNB Sudameris',
  'Banco Itaú',
  'Banco Serfinanza',
  'Banco W',
  'Banco Coomeva',
  'Banco ProCredit',
  'Banco Finandina',
  'Banco Mibanco',
  'Banco Santander de Negocios',
  'Citibank Colombia',
  'Banco de Comercio Exterior (Bancóldex)',
  'Nequi',
  'Daviplata',
  'Bancolombia A La Mano',
] as const;

export type ColombianBank = (typeof COLOMBIAN_BANKS)[number];

/** Cuenta bancaria para recibir pagos de cánones y administración. */
export interface BankAccount {
  id: string;
  bank: ColombianBank | string;
  accountType: 'savings' | 'checking';
  accountNumber: string;          // últimos 4 dígitos o completo, depende del agente
  holderName: string;              // titular de la cuenta
  holderIdNumber: string;          // cédula del titular
  /** Si hay varias cuentas, el agente puede decidir cuál mostrar primero. */
  isPrimary?: boolean;
  notes?: string;
}

// ─── Póliza (seguro de arrendamiento) ──────────────────────────────────

export interface PolicyInfo {
  insurer: string;                 // aseguradora (Sura, Bolívar, Mapfre, etc.)
  policyNumber: string;
  startDate: string;               // ISO date
  endDate: string;
  premiumAmount: number;           // valor de la prima
  /** URL/dataURL del PDF de aprobación subido por el agente. */
  approvalPdfDataUrl?: string;
  approvedAt: string;              // ISO timestamp
  approvedBy: string;              // nombre del agente
  notes?: string;
}

// ─── Política de facturación por propiedad ────────────────────────────

/**
 * Parametrización de la facturación de una propiedad. Se define UNA vez
 * al iniciar el proceso de arrendamiento y define cómo se calculan
 * cánones, moras, descuentos y reportes para esa propiedad específica.
 */
export interface BillingPolicy {
  propertyId: string;

  // ─── Canon y administración base ───────────────────────
  rentAmount: number;               // canon mensual en COP
  adminFee: number;                // cuota de administración en COP

  // ─── Reglas de mora (descuentos al inquilino si paga tarde) ──
  /** % de mora si paga entre día 11 y 20 del mes. Default 5. */
  lateFeeMidPct: number;            // ej: 5
  /** % de mora si paga entre día 21 y 30 del mes. Default 10. */
  lateFeeLatePct: number;           // ej: 10
  /** Día límite para pago "sin mora". Default 10. */
  graceDay: number;                 // ej: 10

  // ─── Reglas de incremento anual ──────────────────────────
  /** Si se aplica IPC anual al canon. Default true. */
  applyAnnualIpc: boolean;
  /** % de IPC esperado (referencial; el real se toma del DANE). Default 0. */
  expectedIpcPct: number;           // ej: 5
  /** Si se aplica el mismo IPC a la administración. Default true. */
  applyIpcToAdmin: boolean;

  // ─── Cambios de administración (cuota extraordinaria) ─────
  /** Permite cambios de administración en cualquier mes. */
  allowAdminChanges: boolean;

  // ─── Datos bancarios para el pago ──────────────────────
  primaryBankAccountId?: string;   // ref a BankAccount.id
  bankAccounts: BankAccount[];

  // ─── Póliza (seguro) ────────────────────────────────────
  policy?: PolicyInfo;

  // ─── Metadatos ─────────────────────────────────────────
  createdAt: string;
  updatedAt: string;
  createdBy: string;                // nombre del agente
}

// ─── Tabla de amortización ────────────────────────────────────────────

/** Una fila de la tabla de amortización para un mes específico. */
export interface AmortizationRow {
  id: string;
  propertyId: string;
  contractId: string;

  /** Número del mes desde el inicio del contrato (1-based). */
  monthNumber: number;
  /** Fecha de inicio del período (ISO date). */
  periodStart: string;
  /** Fecha de fin del período (ISO date). */
  periodEnd: string;
  /** Fecha límite de pago sin mora (calculada según BillingPolicy.graceDay). */
  dueDate: string;

  // ─── Composición del cobro ──────────────────────────────
  baseRent: number;                 // canon base del mes
  baseAdmin: number;                // administración base del mes
  adminAdjustment: number;          // + si hay cambio de administración en este mes
  ipcAdjustment: number;            // + si el IPC anual aplica este mes
  /** Total sin mora (lo que paga si llega a tiempo). */
  subtotal: number;

  // ─── Mora ────────────────────────────────────────────────
  /** % de mora aplicado (0, lateFeeMidPct o lateFeeLatePct según día de pago). */
  appliedLateFeePct: number;
  /** Valor de la mora en pesos. */
  lateFeeAmount: number;
  /** Día real de pago del inquilino (null si no ha pagado). */
  paidOnDayOfMonth: number | null;

  /** Total a pagar (= subtotal + mora). Es el campo que se muestra en la cuenta de cobro. */
  total: number;
  /** Total si paga en los primeros `graceDay` días (= subtotal). */
  totalEarly: number;
  /** Total si paga entre día 11-20. */
  totalMid: number;
  /** Total si paga entre día 21-30. */
  totalLate: number;

  // ─── Estado ─────────────────────────────────────────────
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  paidAt?: string;                  // ISO timestamp del pago
  paidAmount?: number;              // monto pagado
}

// ─── Novedades de cargos a la propiedad (unificado) ────────────────────

/**
 * Tipos de novedad de cargo. Antes este dominio se llamaba "Discount" porque
 * solo modelaba descuentos al propietario. Ahora cubre cualquier cargo que
 * pueda afectar el mes, independientemente de a quién se le imputa.
 *
 * Agregamos dos tipos nuevos (`repair` y `parking`) para cargos típicos que
 * el inquilino debe asumir. El resto coincide con `DiscountType` viejo.
 */
export type ChargeType =
  | 'public_services'      // pago de servicios públicos
  | 'maintenance'          // arreglos locativos / mantenimiento general
  | 'repair'               // reparación imputable al inquilino (daño)
  | 'tax'                  // impuestos (predial, etc.)
  | 'insurance'            // póliza de seguro
  | 'commission'           // comisión adicional / ajuste
  | 'parking'              // parqueo adicional
  | 'other';

/** Etiqueta legible para el tipo de cargo. */
export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  public_services: 'Servicios públicos',
  maintenance:     'Mantenimiento',
  repair:          'Reparación (cargo al inquilino)',
  tax:             'Impuestos',
  insurance:       'Póliza / seguro',
  commission:      'Comisión agencia',
  parking:         'Parqueo adicional',
  other:           'Otro',
};

/** A quién se le imputa el cargo. Define en qué documentos aparece. */
export type ChargedTo = 'owner' | 'tenant' | 'both';

/** Etiqueta legible para el destinatario del cargo. */
export const CHARGED_TO_LABELS: Record<ChargedTo, string> = {
  owner:  'Propietario (descuenta del estado de cuenta)',
  tenant: 'Inquilino (se suma a la cuenta de cobro)',
  both:   'Ambos (aparece en los dos documentos)',
};

/**
 * Reglas de imputación por defecto según el tipo de novedad. Sirve para
 * sugerirle al agente el `charged_to` adecuado (el 90% de los casos cae en
 * el default; el form siempre permite override manual).
 *
 * - Servicios públicos, mantenimiento, impuestos, póliza, comisión, otro →
 *   lo asume el propietario (es gasto del inmueble).
 * - Reparación → lo asume el inquilino (es daño imputable).
 * - Parqueo adicional → lo asume el inquilino (es consumo de un servicio
 *   contratado por él, no inherente a la propiedad).
 */
export function defaultChargedToFor(type: ChargeType): ChargedTo {
  switch (type) {
    case 'public_services':
    case 'maintenance':
    case 'tax':
    case 'insurance':
    case 'commission':
    case 'other':
      return 'owner';
    case 'repair':
    case 'parking':
      return 'tenant';
  }
}

/**
 * Una novedad de cargo registrada contra una propiedad en un mes.
 *
 * Si `charged_to IN ('tenant','both')` y `appliesToInvoice = true`, se suma
 * al subtotal de la cuenta de cobro del periodo.
 * Si `charged_to IN ('owner','both')`, se descuenta del estado de cuenta del
 * propietario del periodo (aparece en MovementsTable).
 */
export interface PropertyCharge {
  id: string;
  propertyId: string;
  period: string;                   // 'YYYY-MM'
  type: ChargeType;
  description: string;
  amount: number;                   // COP, sin decimales
  chargedTo: ChargedTo;
  /**
   * Si true y `chargedTo !== 'owner'`, el monto entra al subtotal de la
   * cuenta de cobro. Si false, queda como registro histórico sin tocar la
   * CC (útil para periodos ya cerrados).
   */
  appliesToInvoice: boolean;
  attachmentUrl?: string;           // opcional: URL del recibo/factura
  recordedAt: string;               // ISO timestamp
  recordedBy: string;               // nombre del agente
}

// ─── Descuentos al propietario (LEGACY, conservado por compat) ────────

/**
 * @deprecated Mantenido por compatibilidad histórica — la nueva fuente de
 * verdad es `PropertyCharge`. La migración 006_property_charges.sql copió
 * los registros viejos a la tabla nueva con `charged_to='owner'`. No usar
 * en código nuevo.
 */
export type DiscountType = ChargeType;

/** @deprecated Usar `PropertyCharge` con `chargedTo = 'owner'`. */
export interface PropertyDiscount {
  id: string;
  propertyId: string;
  type: DiscountType;
  description: string;
  amount: number;
  monthPeriod: string;              // 'YYYY-MM' — el mes al que aplica
  attachmentUrl?: string;          // opcional: dataURL del recibo
  recordedAt: string;               // ISO timestamp
  recordedBy: string;               // nombre del agente
}

/**
 * Helper de compatibilidad: convierte un `PropertyCharge` a la forma vieja
 * `PropertyDiscount` para componentes que aún no se migraron (ejecutivos
 * que ya estaban en producción). Solo incluye cargos del propietario.
 */
export function chargeToDiscount(c: PropertyCharge): PropertyDiscount {
  return {
    id: c.id,
    propertyId: c.propertyId,
    type: c.type as DiscountType,
    description: c.description,
    amount: c.amount,
    monthPeriod: c.period,
    attachmentUrl: c.attachmentUrl,
    recordedAt: c.recordedAt,
    recordedBy: c.recordedBy,
  };
}

// ─── Aumentos al inquilino ─────────────────────────────────────────────

/** Un aumento registrado a un inquilino (incrementa su cuenta de cobro). */
export interface RentIncrease {
  id: string;
  propertyId: string;
  contractId: string;
  type: 'admin_change' | 'ipc_annual';
  description: string;
  /** Si es cambio de administración: el nuevo valor. Si es IPC: el %. */
  amount: number;
  /** 'YYYY-MM' a partir del cual aplica. */
  effectiveFrom: string;
  recordedAt: string;
  recordedBy: string;
}

// ─── Estado de cuenta (vista del propietario) ────────────────────────

/** Estado de cuenta del propietario para una propiedad, en un período. */
export interface AccountStatement {
  propertyId: string;
  period: string;                   // 'YYYY-MM'

  /** Ingresos del propietario en el mes. */
  grossIncome: number;              // canon + admin cobrados al inquilino
  /** Descuentos aplicados (cargos chargedTo='owner' o 'both' del mes). */
  totalDiscounts: number;
  /** Neto a pagar al propietario (= grossIncome - totalDiscounts). */
  netIncome: number;

  /** Detalle de cargos del mes. Solo los que aplican al propietario. */
  discounts: PropertyDiscount[];
}

// ─── Transferencias al propietario (payouts) ─────────────────────────

/**
 * Una transferencia REAL que INMOVIRTUAL le giró al propietario de un
 * inmueble. Es la contraparte "real" del cálculo teórico que produce
 * `calculateMonthlySettlement` (LiquidacionMensual).
 *
 * Un mismo periodo puede tener N payouts (giros parciales, ajustes, etc.).
 * El estado de cuenta mensual muestra AMBOS:
 *   - El cálculo proyectado (línea "Liquidación calculada", abono teórico)
 *   - Los payouts reales (líneas "Transferencia — banco X", abonos efectivos)
 */
export interface OwnerPayout {
  id: string;
  propertyId: string;
  /** Contrato del cual sale el cálculo. NULL cuando el payout es por la
   *  propiedad completa (caso normal — la propiedad tiene 1 contrato activo). */
  contractId?: string;
  /** Periodo al que aplica el pago (YYYY-MM). Distinto de `paidAt`, que es
   *  la fecha REAL del giro (puede ser跨月 si se paga con retraso). */
  period: string;
  /** Monto girado en COP al propietario. */
  amount: number;
  /** Fecha y hora real del giro. */
  paidAt: string;
  /** ID de la cuenta destino del propietario (bank_accounts.id). */
  bankAccountId?: string;
  /** Referencia/comprobante de la transferencia bancaria. */
  reference?: string;
  notes?: string;
  /** Nombre del agente que registró el pago. */
  recordedBy: string;
  recordedAt: string;
}

// ─── Estado de cuenta mensual al propietario (consolidado) ────────────

/**
 * Salida del endpoint `GET /api/billing/owner-statement?propertyId=&period=`.
 * Reúne toda la información que el PDF necesita para imprimir el estado
 * de cuenta del propietario del mes:
 *
 *   - Ingresos brutos del mes (canon + admin + mora cobrados al inquilino)
 *   - Descuentos aplicados (cargos `chargedTo` IN ('owner','both'))
 *   - Retenciones del motor de liquidación (comisión, IVA, retefuente, GMF)
 *   - Neto calculado (lo que se debería transferir al propietario)
 *   - Payouts reales (lo que efectivamente se giró)
 *   - Saldo final (diferencia entre neto y payouts — si quedó saldo a favor
 *     del propietario, va como observación)
 *
 * `chargesToTenant` es información complementaria: muestra al propietario
 * qué cargos del mes se le pasaron al inquilino (útil como auditoría para
 * que pueda validar que no le están colando cargos indebidos).
 *
 * El saldo "anterior" (acumulado de meses previos) NO está incluido acá:
 * si el cliente lo necesita, se calcula en frontend sumando los `finalBalance`
 * de los meses anteriores.
 */
export interface OwnerStatement {
  propertyId: string;
  period: string;                   // 'YYYY-MM'

  // ─── Ingresos del mes (cargos al inquilino, pagados) ──
  grossRent: number;                // canon del mes
  grossAdmin: number;               // cuota de administración del mes
  grossLateFee: number;             // mora cobrada al inquilino
  totalGrossIncome: number;         // = grossRent + grossAdmin + grossLateFee

  // ─── Descuentos del mes (cargos chargedTo IN ('owner','both')) ──
  totalDiscounts: number;
  /** Lista en formato legacy. Mantengo PropertyDiscount para no romper la UI existente. */
  discounts: PropertyDiscount[];
  /**
   * Lista canónica en formato `PropertyCharge`. Misma información que
   * `discounts` más el campo `chargedTo`, para que el PDF pueda etiquetar
   * cada línea con el destinatario correcto.
   */
  charges: PropertyCharge[];

  // ─── Retenciones del motor de liquidación ──
  settlement: {
    commission: number;
    ivaOnCommission: number;
    retefuente: number;
    gmf: number;
    /** Suma de las 4 anteriores. */
    totalRetentions: number;
    /** ComisionPct usado para el cálculo (referencia para auditoría). */
    commissionPct: number;
  };

  // ─── Neto calculado (teórico) ──
  /**
   * Lo que se debería transferir al propietario según el motor de liquidación.
   * Equivale a `calculateMonthlySettlement(...).totales.saldoTransferir`.
   * Incluye la administración PH que se devuelve íntegra al propietario.
   */
  netCalculated: number;

  // ─── Pagos reales registrados ──
  totalPayouts: number;
  payouts: OwnerPayout[];

  // ─── Cargos pasados al inquilino (solo info complementaria) ──
  /**
   * Suma de cargos con `chargedTo = 'tenant' | 'both'` del mes. NO afecta
   * el neto del propietario; se muestra como auditoría. Aparece en el PDF
   * en la sección "Cargos pasados al inquilino".
   */
  totalChargesToTenant: number;

  // ─── Saldo final del mes ──
  /**
   * `netCalculated - totalPayouts`. Si es positivo, hay saldo a favor del
   * propietario pendiente de girar. Si es negativo, se giró de más (raro,
   * requiere investigación). Si es 0, todo cuadrado.
   */
  finalBalance: number;
}

/**
 * Suma de cargos que entran a la cuenta de cobro según `chargedTo`.
 * Se usa cuando el backend arma el subtotal de la `rent_invoice`: tiene
 * que sumar SOLO los cargos donde `chargedTo !== 'owner'` y `appliesToInvoice`.
 */
export interface InvoiceChargesSummary {
  propertyId: string;
  period: string;
  /** Total que se suma al subtotal de la CC. */
  total: number;
  /** Detalle (para imprimir en el PDF en la sección "Otros cargos del mes"). */
  charges: PropertyCharge[];
}

// ─── Cuenta de cobro (vista del inquilino) ─────────────────────────────

/** Cuenta de cobro enviada al inquilino. Generada mensualmente. */
export interface RentInvoice {
  id: string;
  /**
   * Consecutivo visible de la cuenta de cobro (formato CC-YYYYMM-NNN).
   * Se genera en el backend al hacer POST /api/billing/invoices/send y queda
   * NULL hasta entonces (la cuenta aún no fue emitida formalmente). Aparece
   * impreso en el PDF ("CUENTA DE COBRO No. CC-202607-001") y se usa como
   * referencia contable para trazabilidad con el inquilino.
   */
  invoiceNumber?: string;
  propertyId: string;
  contractId: string;
  period: string;                   // 'YYYY-MM'
  dueDate: string;
  subtotal: number;
  totalEarly: number;
  totalMid: number;
  totalLate: number;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  sentAt?: string;                  // cuándo se envió al inquilino
  paidAt?: string;
  paidAmount?: number;
  /** Link de pago (PSE, Nequi, etc.) — opcional. */
  paymentLink?: string;
  /** Notas adicionales que se incluyen en la cuenta. */
  notes?: string;
}

// ─── Histórico de acciones (append-only) ──────────────────────────────

/** Tipos de acciones que quedan registradas en el histórico de un inmueble. */
export type PropertyActionType =
  | 'property_created'
  | 'property_archived'
  | 'property_restored'
  | 'property_owner_changed'
  | 'documents_uploaded'
  | 'mandato_signed'
  | 'inventory_initial_signed'
  | 'inventory_final_signed'
  | 'contract_created'
  | 'contract_signed'
  | 'policy_approved'
  | 'tenant_assigned'
  | 'tenant_changed'
  | 'payment_received'
  | 'discount_registered'
  | 'increase_registered'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'billing_policy_updated'
  | 'bank_account_added'
  | 'property_returned'             // restitución
  | 'note_added';

/** Una entrada del histórico de un inmueble. Append-only. */
export interface PropertyAction {
  id: string;
  propertyId: string;
  type: PropertyActionType;
  /** Descripción legible para el usuario. */
  description: string;
  /** Datos adicionales en JSON. Estructura depende del `type`. */
  payload?: Record<string, any>;
  /** Quién hizo la acción. */
  actorName: string;
  /** Cuándo. */
  occurredAt: string;               // ISO timestamp
}

// Re-export del tipo Contract del módulo de contratos, para que el módulo
// de billing sea autocontenido al importarlo.
export type { Contract } from '../contracts/contractTypes';

// ─── Helpers de tipos ──────────────────────────────────────────────────

/** Calcula la diferencia en meses entre dos fechas ISO (inicio inclusive).
 *  Un contrato de `2026-01-15` a `2027-01-14` → 12 meses (no 13). */
export function monthsBetween(startISO: string, endISO: string): number {
  const a = new Date(startISO);
  const b = new Date(endISO);
  const diff = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(1, diff);
}

/** Formatea un 'YYYY-MM-DD' como 'YYYY-MM' (período). */
export function toPeriod(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** Avanza un mes en formato 'YYYY-MM'. */
export function addMonth(period: string, n = 1): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Genera un id simple (timestamp + random). */
export function genId(prefix = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
