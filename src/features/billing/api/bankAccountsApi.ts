// filepath: src/features/billing/api/bankAccountsApi.ts
// ─── Bank Accounts ───────────────────────────────────────────────────

import { api, tryBackendOrFallbackValue } from "./_internal";
import type { BankAccount } from "../types";

/** Lista las cuentas bancarias de consignación, opcionalmente filtradas por propiedad. */
export async function listBankAccounts(
  propertyId?: string,
): Promise<BankAccount[]> {
  return tryBackendOrFallbackValue(
    async () =>
      api<BankAccount[]>(
        "GET",
        `/billing/bank-accounts${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`,
      ),
    () => [],
  );
}

/** Persiste una cuenta bancaria (server-only — no hay cache local). */
export async function saveBankAccount(
  account: BankAccount & { propertyId?: string | null },
): Promise<void> {
  await tryBackendOrFallbackValue(
    async () => {
      await api("POST", "/billing/bank-accounts", account);
    },
    () => {
      /* no-op local: las cuentas están dentro de BillingPolicy.bankAccounts */
    },
  );
}
