// filepath: src/features/billing/api/invoicesApi.ts
// ─── Cuenta de cobro (factura) ───────────────────────────────────────

import { useBillingStore } from "../billingStore";
import { generateInvoiceFromRow } from "../calculations";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { RentInvoice } from "../types";

/** Genera la cuenta de cobro (invoice) para un mes, contrato y propiedad. */
export async function generateInvoiceForMonth(
  propertyId: string,
  contractId: string,
  period: string,
): Promise<RentInvoice | null> {
  return tryBackendOrFallbackValue(
    async () =>
      api<RentInvoice>("POST", "/billing/invoices/generate", {
        propertyId,
        contractId,
        period,
      }),
    () => {
      const rows = useBillingStore.getState().amortization[contractId] ?? [];
      const row = rows.find((r) => r.periodStart.startsWith(period));
      if (!row) return null;
      const invoice = generateInvoiceFromRow(row, {
        paymentLink:
          useBillingStore.getState().billingPolicies[propertyId]
            ?.primaryBankAccountId,
      });
      useBillingStore.getState().updateInvoice(propertyId, invoice);
      return invoice;
    },
  );
}

/** Lista todas las invoices de una propiedad. */
export async function listInvoices(propertyId: string): Promise<RentInvoice[]> {
  return tryBackendOrFallbackValue(
    async () =>
      api<RentInvoice[]>(
        "GET",
        `/billing/invoices?propertyId=${encodeURIComponent(propertyId)}`,
      ),
    () => useBillingStore.getState().invoices[propertyId] ?? [],
  );
}

/**
 * Lookup directo de la invoice por contrato + periodo. Usado por el frontend
 * para mostrar en la tabla de amortización si el mes ya fue enviado y con qué
 * `invoice_number`. Retorna null si todavía no se emitió.
 */
export async function getInvoiceForPeriod(
  contractId: string,
  period: string,
): Promise<RentInvoice | null> {
  return tryBackendOrFallbackValue(
    async () =>
      api<RentInvoice | null>(
        "GET",
        `/billing/invoices/lookup?contractId=${encodeURIComponent(contractId)}&period=${encodeURIComponent(period)}`,
      ),
    () => {
      const all = Object.values(useBillingStore.getState().invoices).flat();
      return (
        all.find((i) => i.contractId === contractId && i.period === period) ??
        null
      );
    },
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
  period: string,
): Promise<RentInvoice | null> {
  return tryBackendOrFallbackValue(
    async () => {
      const updated = await api<RentInvoice>("POST", "/billing/invoices/send", {
        propertyId,
        contractId,
        period,
      });
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
      const existing = existingList.find(
        (i) => i.contractId === contractId && i.period === period,
      );
      const seq = existingList.filter((i) => i.period === period).length + 1;
      const periodCompact = period.replace("-", "");
      const invoiceNumber =
        existing?.invoiceNumber ??
        `CC-${periodCompact}-${String(seq).padStart(3, "0")}`;
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
        status: existing?.status === "paid" ? "paid" : "pending",
        sentAt: existing?.sentAt ?? new Date().toISOString(),
        paidAt: existing?.paidAt,
        paidAmount: existing?.paidAmount,
        paymentLink: existing?.paymentLink,
        notes: existing?.notes,
      };
      local.updateInvoice(propertyId, updated);
      return updated;
    },
  );
}
