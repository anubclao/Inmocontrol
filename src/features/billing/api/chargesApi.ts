// filepath: src/features/billing/api/chargesApi.ts
// ─── Novedades de cargos (PropertyCharge) ──────────────────────────────

import { useBillingStore } from "../billingStore";
import { summarizeInvoiceCharges } from "../calculations";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type { InvoiceChargesSummary, PropertyCharge } from "../types";

/**
 * Registra una novedad de cargo (servicios, mantenimiento, reparación, etc.)
 * en una propiedad para un período específico. Define a quién se imputa
 * (owner/tenant/both) y si aplica o no a la cuenta de cobro del mes.
 */
export async function addPropertyCharge(
  propertyId: string,
  data: Omit<PropertyCharge, "id" | "recordedAt">,
): Promise<PropertyCharge> {
  const created = await tryBackendOrFallbackValue(
    async () => {
      const id = crypto.randomUUID();
      const full: PropertyCharge = {
        id,
        recordedAt: new Date().toISOString(),
        ...data,
      };
      const saved = await api<PropertyCharge>("POST", "/billing/charges", full);
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
export async function listPropertyCharges(
  propertyId: string,
): Promise<PropertyCharge[]> {
  return tryBackendOrFallbackValue(
    async () =>
      api<PropertyCharge[]>(
        "GET",
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
  return tryBackendOrFallbackValue(
    async () =>
      api<PropertyCharge[]>(
        "GET",
        `/billing/charges?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`,
      ),
    () =>
      (useBillingStore.getState().charges[propertyId] ?? []).filter(
        (c) => c.period === period,
      ),
  );
}

/** Elimina una novedad de cargo por id. */
export async function removePropertyCharge(
  propertyId: string,
  chargeId: string,
): Promise<void> {
  await tryBackendOrFallbackValue(
    async () => {
      await api("DELETE", `/billing/charges/${encodeURIComponent(chargeId)}`);
    },
    () => {
      useBillingStore.getState().removeCharge(propertyId, chargeId);
    },
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
  return tryBackendOrFallbackValue(
    async () =>
      api<InvoiceChargesSummary>(
        "GET",
        `/billing/charges/invoice-summary?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`,
      ),
    () => {
      const charges = useBillingStore.getState().charges[propertyId] ?? [];
      return summarizeInvoiceCharges(propertyId, period, charges);
    },
  );
}
