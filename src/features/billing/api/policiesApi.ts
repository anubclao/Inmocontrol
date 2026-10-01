// filepath: src/features/billing/api/policiesApi.ts
import { useBillingStore } from "../billingStore";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { BillingPolicy } from "../types";

/** Lee la BillingPolicy de una propiedad. Null si no existe. */
export async function getBillingPolicy(
  propertyId: string,
): Promise<BillingPolicy | null> {
  return tryBackendOrFallbackValue(
    async () => {
      try {
        return await api<BillingPolicy>(
          "GET",
          `/billing/policies/${encodeURIComponent(propertyId)}`,
        );
      } catch (err: any) {
        // FIX Karpathy (jul-2026): distinguir 404 (no existe policy — estado
        // válido) de cualquier otro error (500, network). Antes `.catch(() => null)`
        // se comía TODO, y un 500 transitorio después del wizard "Guardar y
        // generar" hacía creer al panel que la policy no existía → banner ámbar
        // quedaba pegado, form mostraba 0/0 (default). Ahora 404 → null, otro
        // error → re-throw para que `tryBackendOrFallback` use el cache local
        // y/o el BillingPanel muestre un toast honesto al usuario.
        const msg = String(err?.message ?? "");
        if (msg.includes("HTTP 404")) return null;
        throw err;
      }
    },
    () => useBillingStore.getState().billingPolicies[propertyId] ?? null,
  );
}

/** Persiste la BillingPolicy de una propiedad (server si hay, local siempre). */
export async function saveBillingPolicy(policy: BillingPolicy): Promise<void> {
  await tryBackendOrFallbackValue(
    async () => {
      await api(
        "PUT",
        `/billing/policies/${encodeURIComponent(policy.propertyId)}`,
        policy,
      );
      // Cache local para UI inmediata
      useBillingStore.getState().setBillingPolicy(policy.propertyId, policy);
    },
    () =>
      useBillingStore.getState().setBillingPolicy(policy.propertyId, policy),
  );
}
