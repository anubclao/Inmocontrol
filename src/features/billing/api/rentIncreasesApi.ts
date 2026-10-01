// filepath: src/features/billing/api/rentIncreasesApi.ts
// ─── Aumentos (al inquilino) ──────────────────────────────────────────

import { useBillingStore } from "../billingStore";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { RentIncrease } from "../types";

/** Registra un aumento de canon para una propiedad. */
export async function addRentIncrease(
  propertyId: string,
  data: Omit<RentIncrease, "id" | "recordedAt">,
): Promise<RentIncrease> {
  return tryBackendOrFallbackValue(
    async () => {
      const id = crypto.randomUUID();
      const created: RentIncrease = {
        id,
        recordedAt: new Date().toISOString(),
        ...data,
      };
      await api("POST", "/billing/increases", created);
      useBillingStore.getState().addIncrease(propertyId, data);
      return created;
    },
    () => {
      useBillingStore.getState().addIncrease(propertyId, data);
      const list = useBillingStore.getState().increases[propertyId] ?? [];
      return list[list.length - 1];
    },
  );
}

/** Lista los aumentos registrados de una propiedad. */
export async function listRentIncreases(
  propertyId: string,
): Promise<RentIncrease[]> {
  return tryBackendOrFallbackValue(
    async () =>
      api<RentIncrease[]>(
        "GET",
        `/billing/increases?propertyId=${encodeURIComponent(propertyId)}`,
      ),
    () => useBillingStore.getState().increases[propertyId] ?? [],
  );
}
