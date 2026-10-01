// filepath: src/features/billing/api/ownerPayoutsApi.ts
// ─── Owner payouts (transferencias reales al propietario) ─────────────

import { useBillingStore } from "../billingStore";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { OwnerPayout } from "../types";

/** Lista los payouts (transferencias reales) de una propiedad, opcionalmente filtrados por período. */
export async function listOwnerPayouts(
  propertyId: string,
  period?: string,
): Promise<OwnerPayout[]> {
  return tryBackendOrFallbackValue(
    async () => {
      const q = period
        ? `?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`
        : `?propertyId=${encodeURIComponent(propertyId)}`;
      return api<OwnerPayout[]>("GET", `/billing/owner-payouts${q}`);
    },
    () =>
      useBillingStore
        .getState()
        .payouts[propertyId]?.filter((p) => !period || p.period === period) ??
      [],
  );
}

/** Crea o actualiza un payout. Si `id` está, hace upsert. */
export async function saveOwnerPayout(
  payout: Omit<OwnerPayout, "id" | "recordedAt"> & { id?: string },
): Promise<OwnerPayout> {
  const id = payout.id ?? crypto.randomUUID();
  return tryBackendOrFallbackValue(
    async () => {
      const saved = await api<OwnerPayout>("POST", "/billing/owner-payouts", {
        ...payout,
        id,
      });
      useBillingStore.getState().addPayout(payout.propertyId, {
        ...payout,
        id,
        recordedAt: new Date().toISOString(),
      });
      return saved;
    },
    () => {
      const full: OwnerPayout = {
        ...payout,
        id,
        recordedAt: new Date().toISOString(),
      };
      useBillingStore.getState().addPayout(payout.propertyId, full);
      return full;
    },
  );
}

/** Elimina un payout por id. */
export async function deleteOwnerPayout(
  propertyId: string,
  payoutId: string,
): Promise<void> {
  await tryBackendOrFallbackValue(
    async () => {
      await api(
        "DELETE",
        `/billing/owner-payouts/${encodeURIComponent(payoutId)}`,
      );
    },
    () => {
      useBillingStore.getState().removePayout(propertyId, payoutId);
    },
  );
}
