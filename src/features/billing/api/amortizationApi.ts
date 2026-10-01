// filepath: src/features/billing/api/amortizationApi.ts
import { useBillingStore } from "../billingStore";
import { generateAmortization, applyPaymentToRow } from "../calculations";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { AmortizationRow, BillingPolicy, Contract } from "../types";

/**
 * Devuelve la amortización existente del contrato. Si no hay rows, la
 * genera (server) o calcula local (fallback) y la guarda.
 */
export async function getOrGenerateAmortization(
  contract: Contract,
  policy: BillingPolicy,
): Promise<AmortizationRow[]> {
  return tryBackendOrFallbackValue(
    async () => {
      try {
        const existing = await api<AmortizationRow[]>(
          "GET",
          `/billing/amortization/${encodeURIComponent(contract.id)}`,
        );
        if (existing && existing.length > 0) {
          useBillingStore.getState().setAmortization(contract.id, existing);
          return existing;
        }
      } catch {
        // 404 o sin rows → generar
      }
      const rows = await api<AmortizationRow[]>(
        "POST",
        "/billing/amortization/generate",
        { contract, policy },
      );
      useBillingStore.getState().setAmortization(contract.id, rows);
      return rows;
    },
    () => {
      const existing = useBillingStore.getState().amortization[contract.id];
      if (existing && existing.length > 0) return existing;
      const increases =
        useBillingStore.getState().increases[contract.propertyId] ?? [];
      const rows = generateAmortization(contract, policy, { increases });
      useBillingStore.getState().setAmortization(contract.id, rows);
      return rows;
    },
  );
}

/**
 * Registra un pago para una fila de amortización. Devuelve la fila
 * actualizada, o null si la fila/policy no existen localmente.
 */
export async function registerPayment(
  contractId: string,
  rowId: string,
  paidOnDayOfMonth: number,
): Promise<AmortizationRow | null> {
  return tryBackendOrFallbackValue(
    async () => {
      const updated = await api<AmortizationRow>("POST", "/billing/payments", {
        contractId,
        rowId,
        paidOnDayOfMonth,
      });
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
    },
  );
}
