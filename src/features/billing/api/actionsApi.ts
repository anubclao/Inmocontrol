// filepath: src/features/billing/api/actionsApi.ts
// ─── Histórico de acciones ───────────────────────────────────────────

import { useBillingStore } from "../billingStore";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { PropertyAction, PropertyActionType } from "../types";

/** Registra una acción en el log (ej: "Envió CC del mes 2026-07"). */
export async function logAction(
  propertyId: string,
  type: PropertyActionType,
  description: string,
  actorName: string,
  payload?: Record<string, any>,
): Promise<PropertyAction> {
  return tryBackendOrFallbackValue(
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
      await api("POST", "/billing/actions", created);
      useBillingStore
        .getState()
        .recordAction(propertyId, type, description, actorName, payload);
      return created;
    },
    () =>
      useBillingStore
        .getState()
        .recordAction(propertyId, type, description, actorName, payload),
  );
}

/** Lista el log de acciones de una propiedad. */
export async function listActions(
  propertyId: string,
): Promise<PropertyAction[]> {
  return tryBackendOrFallbackValue(
    async () =>
      api<PropertyAction[]>(
        "GET",
        `/billing/actions?propertyId=${encodeURIComponent(propertyId)}`,
      ),
    () => useBillingStore.getState().actions[propertyId] ?? [],
  );
}
