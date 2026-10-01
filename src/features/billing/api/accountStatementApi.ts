// filepath: src/features/billing/api/accountStatementApi.ts
// ─── Estado de cuenta ────────────────────────────────────────────────

import { useBillingStore } from "../billingStore";
import { calculateAccountStatement } from "../calculations";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { AccountStatement, AmortizationRow } from "../types";

/** Estado de cuenta agregado (legacy — reemplazado por ownerStatementApi). */
export async function getAccountStatement(
  propertyId: string,
  period: string,
): Promise<AccountStatement> {
  return tryBackendOrFallbackValue(
    async () =>
      api<AccountStatement>(
        "GET",
        `/billing/account-statement?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`,
      ),
    () => {
      const rows: AmortizationRow[] = Object.values(
        useBillingStore.getState().amortization,
      )
        .flat()
        .filter(
          (r) =>
            r.propertyId === propertyId && r.periodStart.startsWith(period),
        );
      const grossIncome = rows
        .filter((r) => r.status === "paid")
        .reduce((s, r) => s + r.total, 0);
      // Combinar descuentos legacy + cargos nuevos unificados (chargedTo IN ('owner','both')).
      const legacy = useBillingStore.getState().discounts[propertyId] ?? [];
      const charges = useBillingStore.getState().charges[propertyId] ?? [];
      return calculateAccountStatement(propertyId, period, grossIncome, [
        ...legacy,
        ...charges,
      ]);
    },
  );
}
