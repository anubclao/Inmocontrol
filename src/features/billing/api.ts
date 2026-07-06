/**
 * InmoControl — Billing API client
 * ============================================================================
 * Capa de abstracción para que el resto del código consuma el billing sin
 * acoplarse al storage. Intenta hablar con el backend MySQL vía fetch; si
 * falla (sin servidor, MySQL caído, error 5xx), cae a Zustand/localStorage
 * para que la app nunca se rompa.
 *
 * El backend expone los mismos contratos que esta API:
 *   /api/billing/policies/:propertyId
 *   /api/billing/amortization/...
 *   /api/billing/discounts
 *   /api/billing/increases
 *   /api/billing/account-statement
 *   /api/billing/invoices/...
 *   /api/billing/actions
 *   /api/billing/bank-accounts
 *   /api/billing/insurance-policies
 *   /api/entities/sync
 */
import {
  useBillingStore
} from './billingStore';
import {
  generateAmortization,
  generateInvoiceFromRow,
  calculateAccountStatement,
  applyPaymentToRow,
  summarizeInvoiceCharges,
} from './calculations';
import type {
  AccountStatement,
  AmortizationRow,
  BillingPolicy,
  Contract,
  InvoiceChargesSummary,
  OwnerPayout,
  OwnerStatement,
  PropertyAction,
  PropertyActionType,
  PropertyCharge,
  PropertyDiscount,
  RentIncrease,
  RentInvoice,
  BankAccount,
  PolicyInfo,
} from './types';
// ─── Modo de operación ─────────────────────────────────────────────────

type Mode = 'backend' | 'local';

let currentMode: Mode = 'local'; // default conservador; /api/health lo cambia a 'backend' si responde
let modeDetected = false;

async function detectMode(): Promise<Mode> {
  if (modeDetected) return currentMode;
  modeDetected = true;
  try {
    const r = await fetch('/api/health', { method: 'GET' });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j?.db?.ok) {
        currentMode = 'backend';
        console.info('[billing/api] Backend MySQL detectado. Usando fetch.');
        return 'backend';
      }
    }
  } catch {
    // silent
  }
  console.info('[billing/api] Backend no disponible. Usando localStorage.');
  return currentMode;
}

async function api<T>(method: string, path: string, body?: any): Promise<T> {
  const mode = await detectMode();
  if (mode === 'local') {
    throw new Error('backend unavailable');
  }
  const r = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

// Helper: try backend; on error, run fallback.
async function tryBackendOrFallback<T>(backendCall: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  const mode = await detectMode();
  if (mode === 'local') return fallback();
  try {
    return await backendCall();
  } catch (err) {
    console.warn('[billing/api] backend falló, usando fallback local:', err);
    return fallback();
  }
}

// ─── Sync de entidades base (properties/contracts/tenants) ─────────────
// Llamado al iniciar la app para que la DB tenga las FK resueltas.

export async function syncEntities(payload: {
  organizations?: any[];
  properties?: any[];
  tenants?: any[];
  contracts?: any[];
}): Promise<void> {
  const mode = await detectMode();
  if (mode === 'local') return;
  try {
    await api('POST', '/entities/sync', payload);
  } catch (err) {
    console.warn('[billing/api] syncEntities falló:', err);
  }
}

// ─── BillingPolicy ─────────────────────────────────────────────────────

export async function getBillingPolicy(propertyId: string): Promise<BillingPolicy | null> {
  return tryBackendOrFallback(
    async () => {
      const p = await api<BillingPolicy | null>('GET', `/billing/policies/${encodeURIComponent(propertyId)}`).catch(() => null);
      // Si el backend devuelve 404 → null (no existe policy aún)
      return p;
    },
    () => useBillingStore.getState().billingPolicies[propertyId] ?? null
  );
}

export async function saveBillingPolicy(policy: BillingPolicy): Promise<void> {
  await tryBackendOrFallback(
    async () => {
      await api('PUT', `/billing/policies/${encodeURIComponent(policy.propertyId)}`, policy);
      // Cache local para UI inmediata
      useBillingStore.getState().setBillingPolicy(policy.propertyId, policy);
    },
    () => useBillingStore.getState().setBillingPolicy(policy.propertyId, policy)
  );
}

// ─── Amortización ─────────────────────────────────────────────────────

export async function getOrGenerateAmortization(contract: Contract, policy: BillingPolicy): Promise<AmortizationRow[]> {
  return tryBackendOrFallback(
    async () => {
      try {
        const existing = await api<AmortizationRow[]>('GET', `/billing/amortization/${encodeURIComponent(contract.id)}`);
        if (existing && existing.length > 0) {
          useBillingStore.getState().setAmortization(contract.id, existing);
          return existing;
        }
      } catch {
        // 404 o sin rows → generar
      }
      const rows = await api<AmortizationRow[]>('POST', '/billing/amortization/generate', { contract, policy });
      useBillingStore.getState().setAmortization(contract.id, rows);
      return rows;
    },
    () => {
      const existing = useBillingStore.getState().amortization[contract.id];
      if (existing && existing.length > 0) return existing;
      const increases = useBillingStore.getState().increases[contract.propertyId] ?? [];
      const rows = generateAmortization(contract, policy, { increases });
      useBillingStore.getState().setAmortization(contract.id, rows);
      return rows;
    }
  );
}

export async function registerPayment(
  contractId: string,
  rowId: string,
  paidOnDayOfMonth: number
): Promise<AmortizationRow | null> {
  return tryBackendOrFallback(
    async () => {
      const updated = await api<AmortizationRow>('POST', '/billing/payments', { contractId, rowId, paidOnDayOfMonth });
      // Update local cache
      const rows = useBillingStore.getState().amortization[contractId] ?? [];
      const idx = rows.findIndex((r) => r.id === rowId);
      if (idx >= 0) {
        const newRows = [...rows];
        newRows[idx] = updated;
        useBillingStore.getState().setAmortization(contractId, newRows);
      }
      return updated;
    },
    () => {
      const state = useBillingStore.getState();
      const rows = state.amortization[contractId] ?? [];
      const row = rows.find((r) => r.id === rowId);
      if (!row) return null;
      const policy = state.billingPolicies[row.propertyId];
      if (!policy) return null;
      const updated = applyPaymentToRow(row, paidOnDayOfMonth, policy);
      state.updateAmortizationRow(contractId, updated);
      return updated;
    }
  );
}

// ─── Descuentos (LEGACY — solo compatibilidad) ─────────────────────────

/**
 * @deprecated Mantenido por compat. Los descuentos al propietario ahora
 * son `PropertyCharge` con `chargedTo='owner'`. Usar `addPropertyCharge`.
 */
export async function addPropertyDiscount(
  propertyId: string,
  data: Omit<PropertyDiscount, 'id' | 'recordedAt'>
): Promise<PropertyDiscount> {
  return tryBackendOrFallback(
    async () => {
      const id = crypto.randomUUID();
      const created: PropertyDiscount = { id, recordedAt: new Date().toISOString(), ...data };
      await api('POST', '/billing/discounts', created);
      useBillingStore.getState().addDiscount(propertyId, data);
      return created;
    },
    () => {
      useBillingStore.getState().addDiscount(propertyId, data);
      const list = useBillingStore.getState().discounts[propertyId] ?? [];
      return list[list.length - 1];
    }
  );
}

/**
 * @deprecated Usar `listPropertyCharges` y filtrar por `chargedTo`.
 */
export async function listPropertyDiscounts(propertyId: string): Promise<PropertyDiscount[]> {
  return tryBackendOrFallback(
    async () => {
      const charges = await api<PropertyCharge[]>(
        'GET',
        `/billing/charges?propertyId=${encodeURIComponent(propertyId)}`,
      );
      // Mapear cargos con chargedTo='owner'/'both' a la forma legacy
      return charges
        .filter((c) => c.chargedTo === 'owner' || c.chargedTo === 'both')
        .map((c) => ({
          id: c.id,
          propertyId: c.propertyId,
          type: c.type,
          description: c.description,
          amount: c.amount,
          monthPeriod: c.period,
          attachmentUrl: c.attachmentUrl,
          recordedAt: c.recordedAt,
          recordedBy: c.recordedBy,
        }));
    },
    () => {
      const charges = useBillingStore.getState().charges[propertyId] ?? [];
      return charges
        .filter((c) => c.chargedTo === 'owner' || c.chargedTo === 'both')
        .map((c) => ({
          id: c.id,
          propertyId: c.propertyId,
          type: c.type,
          description: c.description,
          amount: c.amount,
          monthPeriod: c.period,
          attachmentUrl: c.attachmentUrl,
          recordedAt: c.recordedAt,
          recordedBy: c.recordedBy,
        }));
    },
  );
}

// ─── Novedades de cargos (PropertyCharge) ──────────────────────────────

/**
 * Registra una novedad de cargo (servicios, mantenimiento, reparación, etc.)
 * en una propiedad para un período específico. Define a quién se imputa
 * (owner/tenant/both) y si aplica o no a la cuenta de cobro del mes.
 */
export async function addPropertyCharge(
  propertyId: string,
  data: Omit<PropertyCharge, 'id' | 'recordedAt'>,
): Promise<PropertyCharge> {
  const created = await tryBackendOrFallback(
    async () => {
      const id = crypto.randomUUID();
      const full: PropertyCharge = { id, recordedAt: new Date().toISOString(), ...data };
      const saved = await api<PropertyCharge>('POST', '/billing/charges', full);
      useBillingStore.getState().addCharge(propertyId, data);
      return saved;
    },
    () => {
      useBillingStore.getState().addCharge(propertyId, data);
      const list = useBillingStore.getState().charges[propertyId] ?? [];
      return list[list.length - 1];
    },
  );
  return created;
}

/** Lista todas las novedades de cargo de una propiedad. */
export async function listPropertyCharges(propertyId: string): Promise<PropertyCharge[]> {
  return tryBackendOrFallback(
    async () => api<PropertyCharge[]>(
      'GET',
      `/billing/charges?propertyId=${encodeURIComponent(propertyId)}`,
    ),
    () => useBillingStore.getState().charges[propertyId] ?? [],
  );
}

/** Lista las novedades de cargo de una propiedad en un período específico. */
export async function listPropertyChargesForPeriod(
  propertyId: string,
  period: string,
): Promise<PropertyCharge[]> {
  return tryBackendOrFallback(
    async () => api<PropertyCharge[]>(
      'GET',
      `/billing/charges?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`,
    ),
    () => (useBillingStore.getState().charges[propertyId] ?? [])
      .filter((c) => c.period === period),
  );
}

/** Elimina una novedad de cargo por id. */
export async function removePropertyCharge(propertyId: string, chargeId: string): Promise<void> {
  await tryBackendOrFallback(
    async () => { await api('DELETE', `/billing/charges/${encodeURIComponent(chargeId)}`); },
    () => { useBillingStore.getState().removeCharge(propertyId, chargeId); },
  );
}

/**
 * Resumen de cargos que entran en la cuenta de cobro del mes (informe
 * intermedio que consumen tanto el PDF como la UI para mostrar el
 * desglose de "Otros cargos del mes").
 */
export async function getInvoiceChargesSummary(
  propertyId: string,
  period: string,
): Promise<InvoiceChargesSummary> {
  return tryBackendOrFallback(
    async () => api<InvoiceChargesSummary>(
      'GET',
      `/billing/charges/invoice-summary?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`,
    ),
    () => {
      const charges = useBillingStore.getState().charges[propertyId] ?? [];
      return summarizeInvoiceCharges(propertyId, period, charges);
    },
  );
}

// ─── Aumentos (al inquilino) ──────────────────────────────────────────

export async function addRentIncrease(
  propertyId: string,
  data: Omit<RentIncrease, 'id' | 'recordedAt'>
): Promise<RentIncrease> {
  return tryBackendOrFallback(
    async () => {
      const id = crypto.randomUUID();
      const created: RentIncrease = { id, recordedAt: new Date().toISOString(), ...data };
      await api('POST', '/billing/increases', created);
      useBillingStore.getState().addIncrease(propertyId, data);
      return created;
    },
    () => {
      useBillingStore.getState().addIncrease(propertyId, data);
      const list = useBillingStore.getState().increases[propertyId] ?? [];
      return list[list.length - 1];
    }
  );
}

export async function listRentIncreases(propertyId: string): Promise<RentIncrease[]> {
  return tryBackendOrFallback(
    async () => api<RentIncrease[]>('GET', `/billing/increases?propertyId=${encodeURIComponent(propertyId)}`),
    () => useBillingStore.getState().increases[propertyId] ?? []
  );
}

// ─── Estado de cuenta ────────────────────────────────────────────────

export async function getAccountStatement(
  propertyId: string,
  period: string
): Promise<AccountStatement> {
  return tryBackendOrFallback(
    async () => api<AccountStatement>('GET', `/billing/account-statement?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`),
    () => {
      const rows: AmortizationRow[] = Object.values(useBillingStore.getState().amortization)
        .flat()
        .filter((r) => r.propertyId === propertyId && r.periodStart.startsWith(period));
      const grossIncome = rows
        .filter((r) => r.status === 'paid')
        .reduce((s, r) => s + r.total, 0);
      // Combinar descuentos legacy + cargos nuevos unificados (chargedTo IN ('owner','both')).
      const legacy = useBillingStore.getState().discounts[propertyId] ?? [];
      const charges = useBillingStore.getState().charges[propertyId] ?? [];
      return calculateAccountStatement(
        propertyId,
        period,
        grossIncome,
        [...legacy, ...charges],
      );
    }
  );
}

// ─── Cuenta de cobro (factura) ───────────────────────────────────────

export async function generateInvoiceForMonth(
  propertyId: string,
  contractId: string,
  period: string
): Promise<RentInvoice | null> {
  return tryBackendOrFallback(
    async () => api<RentInvoice>('POST', '/billing/invoices/generate', { propertyId, contractId, period }),
    () => {
      const rows = useBillingStore.getState().amortization[contractId] ?? [];
      const row = rows.find((r) => r.periodStart.startsWith(period));
      if (!row) return null;
      const invoice = generateInvoiceFromRow(row, {
        paymentLink: useBillingStore.getState().billingPolicies[propertyId]?.primaryBankAccountId,
      });
      useBillingStore.getState().updateInvoice(propertyId, invoice);
      return invoice;
    }
  );
}

export async function listInvoices(propertyId: string): Promise<RentInvoice[]> {
  return tryBackendOrFallback(
    async () => api<RentInvoice[]>('GET', `/billing/invoices?propertyId=${encodeURIComponent(propertyId)}`),
    () => useBillingStore.getState().invoices[propertyId] ?? []
  );
}

/**
 * Lookup directo de la invoice por contrato + periodo. Usado por el frontend
 * para mostrar en la tabla de amortización si el mes ya fue enviado y con qué
 * `invoice_number`. Retorna null si todavía no se emitió.
 */
export async function getInvoiceForPeriod(
  contractId: string,
  period: string
): Promise<RentInvoice | null> {
  return tryBackendOrFallback(
    async () => api<RentInvoice | null>('GET', `/billing/invoices/lookup?contractId=${encodeURIComponent(contractId)}&period=${encodeURIComponent(period)}`),
    () => {
      const all = Object.values(useBillingStore.getState().invoices).flat();
      return all.find((i) => i.contractId === contractId && i.period === period) ?? null;
    }
  );
}

/**
 * Marca una cuenta de cobro como ENVIADA: el backend genera el
 * `invoice_number` (CC-YYYYMM-NNN) y setea `sent_at = NOW()`.
 *
 * Flujo del módulo de finanzas:
 *   1. Agente hace click en "Enviar cuenta de cobro" del mes N
 *   2. Se llama a esta función (que pega al backend)
 *   3. Backend genera invoice_number + marca sent_at
 *   4. Se descarga el PDF con el formato del modelo colombiano
 *   5. Agente envía el PDF al inquilino (email/WhatsApp/impreso)
 */
export async function markInvoiceAsSent(
  propertyId: string,
  contractId: string,
  period: string
): Promise<RentInvoice | null> {
  return tryBackendOrFallback(
    async () => {
      const updated = await api<RentInvoice>('POST', '/billing/invoices/send', { propertyId, contractId, period });
      // Cache local para UI inmediata
      if (updated) {
        useBillingStore.getState().updateInvoice(propertyId, updated);
      }
      return updated;
    },
    () => {
      // Fallback local: genera un invoice_number sintético + marca sent
      const local = useBillingStore.getState();
      const existingList = local.invoices[propertyId] ?? [];
      const existing = existingList.find((i) => i.contractId === contractId && i.period === period);
      const seq = existingList.filter((i) => i.period === period).length + 1;
      const periodCompact = period.replace('-', '');
      const invoiceNumber = existing?.invoiceNumber ?? `CC-${periodCompact}-${String(seq).padStart(3, '0')}`;
      const updated: RentInvoice = {
        id: existing?.id ?? `inv-local-${Date.now()}`,
        invoiceNumber,
        propertyId,
        contractId,
        period,
        dueDate: existing?.dueDate ?? `${period}-10`,
        subtotal: existing?.subtotal ?? 0,
        totalEarly: existing?.totalEarly ?? 0,
        totalMid: existing?.totalMid ?? 0,
        totalLate: existing?.totalLate ?? 0,
        status: existing?.status === 'paid' ? 'paid' : 'pending',
        sentAt: existing?.sentAt ?? new Date().toISOString(),
        paidAt: existing?.paidAt,
        paidAmount: existing?.paidAmount,
        paymentLink: existing?.paymentLink,
        notes: existing?.notes,
      };
      local.updateInvoice(propertyId, updated);
      return updated;
    }
  );
}

// ─── Owner payouts (transferencias reales al propietario) ─────────────

export async function listOwnerPayouts(propertyId: string, period?: string): Promise<OwnerPayout[]> {
  return tryBackendOrFallback(
    async () => {
      const q = period
        ? `?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`
        : `?propertyId=${encodeURIComponent(propertyId)}`;
      return api<OwnerPayout[]>('GET', `/billing/owner-payouts${q}`);
    },
    () => useBillingStore.getState().payouts[propertyId]?.filter((p) => !period || p.period === period) ?? []
  );
}

export async function saveOwnerPayout(
  payout: Omit<OwnerPayout, 'id' | 'recordedAt'> & { id?: string }
): Promise<OwnerPayout> {
  const id = payout.id ?? crypto.randomUUID();
  return tryBackendOrFallback(
    async () => {
      const saved = await api<OwnerPayout>('POST', '/billing/owner-payouts', { ...payout, id });
      useBillingStore.getState().addPayout(payout.propertyId, { ...payout, id, recordedAt: new Date().toISOString() });
      return saved;
    },
    () => {
      const full: OwnerPayout = { ...payout, id, recordedAt: new Date().toISOString() };
      useBillingStore.getState().addPayout(payout.propertyId, full);
      return full;
    }
  );
}

export async function deleteOwnerPayout(propertyId: string, payoutId: string): Promise<void> {
  await tryBackendOrFallback(
    async () => { await api('DELETE', `/billing/owner-payouts/${encodeURIComponent(payoutId)}`); },
    () => { useBillingStore.getState().removePayout(propertyId, payoutId); }
  );
}

/**
 * Estado de cuenta consolidado del propietario para un mes. Reúne:
 *   - Ingresos del inquilino (amortización pagada)
 *   - Descuentos aplicados (property_discounts)
 *   - Retenciones del motor de liquidación (comisión, IVA, retefuente, GMF)
 *   - Payouts reales registrados (owner_payouts)
 *   - Saldo final (netCalculated - totalPayouts)
 *
 * El PDF de estado de cuenta consume esta salida directamente.
 */
export async function getOwnerStatement(propertyId: string, period: string): Promise<OwnerStatement | null> {
  return tryBackendOrFallback(
    async () => api<OwnerStatement>(
      'GET',
      `/billing/owner-statement?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`
    ),
    () => {
      // Fallback local: arma el statement desde el store (amortización + cargos + payouts)
      const state = useBillingStore.getState();
      const amortization = Object.values(state.amortization).flat()
        .filter((r) => r.propertyId === propertyId && r.periodStart.startsWith(period));
      // Cargos unificados del período. Compat: descuentos legacy también cuentan.
      const periodCharges: PropertyCharge[] =
        state.charges[propertyId]?.filter((c) => c.period === period) ?? [];
      const ownerCharges = periodCharges.filter(
        (c) => c.chargedTo === 'owner' || c.chargedTo === 'both',
      );
      const legacyDiscounts: PropertyDiscount[] =
        state.discounts[propertyId]?.filter((d) => d.monthPeriod === period) ?? [];
      // Mapeo los descuentos legacy a cargos para homogeneizar el cálculo.
      const legacyAsCharges: PropertyCharge[] = legacyDiscounts.map((d) => ({
        id: d.id,
        propertyId: d.propertyId,
        period: d.monthPeriod,
        type: d.type,
        description: d.description,
        amount: d.amount,
        chargedTo: 'owner' as const,
        appliesToInvoice: false,
        attachmentUrl: d.attachmentUrl,
        recordedAt: d.recordedAt,
        recordedBy: d.recordedBy,
      }));
      const allOwnerCharges = [...ownerCharges, ...legacyAsCharges];
      const totalDiscounts = allOwnerCharges.reduce((s, c) => s + c.amount, 0);

      const tenantCharges = periodCharges.filter(
        (c) => c.chargedTo === 'tenant' || c.chargedTo === 'both',
      );
      const totalChargesToTenant = tenantCharges.reduce((s, c) => s + c.amount, 0);

      const payouts = state.payouts[propertyId]?.filter((p) => p.period === period) ?? [];

      const grossRent = amortization.filter((r) => r.status === 'paid').reduce((s, r) => s + r.baseRent, 0);
      const grossAdmin = amortization.filter((r) => r.status === 'paid').reduce((s, r) => s + r.baseAdmin, 0);
      const grossLateFee = amortization.filter((r) => r.status === 'paid').reduce((s, r) => s + r.lateFeeAmount, 0);
      const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);

      // Estimación de settlement (sin retefuente si canon <= 27 UVT)
      // La comisión por default es 8% — el cálculo preciso lo hace el backend
      // cuando está disponible (loadPolicy + contract.commission_percentage).
      const commissionPct = 8;
      const baseGross = grossRent + grossLateFee;
      const comision = Math.round(baseGross * (commissionPct / 100));
      const ivaOnComision = Math.round(comision * 0.19);
      const baseGmf = Math.max(0, baseGross - comision - ivaOnComision);
      const gmf = Math.round(baseGmf * 0.004);
      const netCalculated = Math.max(0, baseGross + grossAdmin - comision - ivaOnComision - gmf - totalDiscounts);

      // discounts en formato legacy PropertyDiscount para UI ya en producción
      const discountsLegacy: PropertyDiscount[] = allOwnerCharges.map((c) => ({
        id: c.id,
        propertyId: c.propertyId,
        type: c.type as any,
        description: c.description,
        amount: c.amount,
        monthPeriod: c.period,
        attachmentUrl: c.attachmentUrl,
        recordedAt: c.recordedAt,
        recordedBy: c.recordedBy,
      }));

      return {
        propertyId,
        period,
        grossRent,
        grossAdmin,
        grossLateFee,
        totalGrossIncome: grossRent + grossAdmin + grossLateFee,
        totalDiscounts,
        discounts: discountsLegacy,
        charges: allOwnerCharges,
        settlement: {
          commission: comision,
          ivaOnCommission: ivaOnComision,
          retefuente: 0,
          gmf,
          totalRetentions: comision + ivaOnComision + gmf,
          commissionPct,
        },
        netCalculated,
        totalPayouts,
        payouts,
        totalChargesToTenant,
        finalBalance: netCalculated - totalPayouts,
      };
    }
  );
}

// ─── Histórico de acciones ───────────────────────────────────────────

export async function logAction(
  propertyId: string,
  type: PropertyActionType,
  description: string,
  actorName: string,
  payload?: Record<string, any>
): Promise<PropertyAction> {
  return tryBackendOrFallback(
    async () => {
      const id = crypto.randomUUID();
      const created: PropertyAction = {
        id,
        propertyId,
        type,
        description,
        payload,
        actorName,
        occurredAt: new Date().toISOString(),
      };
      await api('POST', '/billing/actions', created);
      useBillingStore.getState().recordAction(propertyId, type, description, actorName, payload);
      return created;
    },
    () => useBillingStore.getState().recordAction(propertyId, type, description, actorName, payload)
  );
}

export async function listActions(propertyId: string): Promise<PropertyAction[]> {
  return tryBackendOrFallback(
    async () => api<PropertyAction[]>('GET', `/billing/actions?propertyId=${encodeURIComponent(propertyId)}`),
    () => useBillingStore.getState().actions[propertyId] ?? []
  );
}

// ─── Bank Accounts ───────────────────────────────────────────────────

export async function listBankAccounts(propertyId?: string): Promise<BankAccount[]> {
  return tryBackendOrFallback(
    async () => api<BankAccount[]>('GET', `/billing/bank-accounts${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''}`),
    () => []
  );
}

export async function saveBankAccount(account: BankAccount & { propertyId?: string | null }): Promise<void> {
  await tryBackendOrFallback(
    async () => { await api('POST', '/billing/bank-accounts', account); },
    () => { /* no-op local: las cuentas están dentro de BillingPolicy.bankAccounts */ }
  );
}

// ─── Insurance Policies ──────────────────────────────────────────────

export async function getInsurancePolicy(propertyId: string): Promise<PolicyInfo | null> {
  return tryBackendOrFallback(
    async () => {
      const rows = await api<any[]>('GET', `/billing/insurance-policies/${encodeURIComponent(propertyId)}`);
      const latest = rows?.[0];
      if (!latest) return null;
      return {
        insurer: latest.insurer,
        policyNumber: latest.policy_number,
        startDate: latest.start_date,
        endDate: latest.end_date,
        premiumAmount: Number(latest.premium_amount),
        approvalPdfDataUrl: latest.approval_pdf_url ?? undefined,
        approvedAt: latest.approved_at,
        approvedBy: latest.approved_by,
        notes: latest.notes ?? undefined,
      };
    },
    () => null
  );
}

export async function saveInsurancePolicy(p: PolicyInfo & { propertyId: string }): Promise<void> {
  await tryBackendOrFallback(
    async () => {
      await api('POST', '/billing/insurance-policies', {
        propertyId: p.propertyId,
        insurer: p.insurer,
        policyNumber: p.policyNumber,
        startDate: p.startDate,
        endDate: p.endDate,
        premiumAmount: p.premiumAmount,
        approvalPdfUrl: p.approvalPdfDataUrl,
        approvedBy: p.approvedBy,
        notes: p.notes,
      });
    },
    () => { /* no-op local */ }
  );
}

// ─── Util ─────────────────────────────────────────────────────────────

/** Fuerza re-detección del modo (útil tras login o settings change). */
export function resetApiMode(): void {
  modeDetected = false;
  currentMode = 'local';
}

export function getApiMode(): Mode {
  return currentMode;
}