// filepath: src/features/billing/api/discountsApi.ts
// ─── Descuentos (LEGACY — solo compatibilidad) ─────────────────────────

import { useBillingStore } from "../billingStore";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { PropertyCharge, PropertyDiscount } from "../types";

/**
 * @deprecated Mantenido por compat. Los descuentos al propietario ahora
 * son `PropertyCharge` con `chargedTo='owner'`. Usar `addPropertyCharge`.
 */
export async function addPropertyDiscount(
  propertyId: string,
  data: Omit<PropertyDiscount, "id" | "recordedAt">,
): Promise<PropertyDiscount> {
  return tryBackendOrFallbackValue(
    async () => {
      const id = crypto.randomUUID();
      const created: PropertyDiscount = {
        id,
        recordedAt: new Date().toISOString(),
        ...data,
      };
      await api("POST", "/billing/discounts", created);
      useBillingStore.getState().addDiscount(propertyId, data);
      return created;
    },
    () => {
      useBillingStore.getState().addDiscount(propertyId, data);
      const list = useBillingStore.getState().discounts[propertyId] ?? [];
      return list[list.length - 1];
    },
  );
}

/**
 * @deprecated Usar `listPropertyCharges` y filtrar por `chargedTo`.
 */
export async function listPropertyDiscounts(
  propertyId: string,
): Promise<PropertyDiscount[]> {
  return tryBackendOrFallbackValue(
    async () => {
      const charges = await api<PropertyCharge[]>(
        "GET",
        `/billing/charges?propertyId=${encodeURIComponent(propertyId)}`,
      );
      // Mapear cargos con chargedTo='owner'/'both' a la forma legacy
      return charges
        .filter((c) => c.chargedTo === "owner" || c.chargedTo === "both")
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
        .filter((c) => c.chargedTo === "owner" || c.chargedTo === "both")
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
