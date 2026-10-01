// filepath: src/features/billing/api/ownerStatementApi.ts
// ─── Owner Statement (estado de cuenta del PROPIETARIO) ──────────────

import { useBillingStore } from "../billingStore";
import { api, tryBackendOrFallbackValue } from "./_internal";
import type {
  OwnerStatement,
  PropertyCharge,
  PropertyDiscount,
} from "../types";

/**
 * Estado de cuenta consolidado del propietario para un mes. Reúne:
 *   - Ingresos del inquilino (amortización pagada)
 *   - Descuentos aplicados (property_discounts)
 *   - Retenciones del motor de liquidación (comisión, IVA, retefuente, GMF)
 *   - Payouts reales registrados (owner_payouts)
 *   - Saldo final (netCalculated - totalPayouts)
 *
 * El PDF de estado de cuenta consume esta salida directamente.
 */
export async function getOwnerStatement(
  propertyId: string,
  period: string,
): Promise<OwnerStatement | null> {
  return tryBackendOrFallbackValue(
    async () =>
      api<OwnerStatement>(
        "GET",
        `/billing/owner-statement?propertyId=${encodeURIComponent(propertyId)}&period=${encodeURIComponent(period)}`,
      ),
    () => buildLocalOwnerStatement(propertyId, period),
  );
}

/**
 * Fallback local: arma el statement desde el store (amortización + cargos + payouts).
 * Mantenido como helper para que ownerStatementApi.ts quede legible.
 */
function buildLocalOwnerStatement(
  propertyId: string,
  period: string,
): OwnerStatement {
  const state = useBillingStore.getState();
  const amortization = Object.values(state.amortization)
    .flat()
    .filter(
      (r) => r.propertyId === propertyId && r.periodStart.startsWith(period),
    );

  // Cargos unificados del período. Compat: descuentos legacy también cuentan.
  const periodCharges: PropertyCharge[] =
    state.charges[propertyId]?.filter((c) => c.period === period) ?? [];
  const ownerCharges = periodCharges.filter(
    (c) => c.chargedTo === "owner" || c.chargedTo === "both",
  );
  const legacyDiscounts: PropertyDiscount[] =
    state.discounts[propertyId]?.filter((d) => d.monthPeriod === period) ?? [];
  // Mapeo los descuentos legacy a cargos para homogeneizar el cálculo.
  const legacyAsCharges: PropertyCharge[] = legacyDiscounts.map((d) => ({
    id: d.id,
    propertyId: d.propertyId,
    period: d.monthPeriod,
    type: d.type,
    description: d.description,
    amount: d.amount,
    chargedTo: "owner" as const,
    appliesToInvoice: false,
    attachmentUrl: d.attachmentUrl,
    recordedAt: d.recordedAt,
    recordedBy: d.recordedBy,
  }));
  const allOwnerCharges = [...ownerCharges, ...legacyAsCharges];
  const totalDiscounts = allOwnerCharges.reduce((s, c) => s + c.amount, 0);

  const tenantCharges = periodCharges.filter(
    (c) => c.chargedTo === "tenant" || c.chargedTo === "both",
  );
  const totalChargesToTenant = tenantCharges.reduce((s, c) => s + c.amount, 0);

  const payouts =
    state.payouts[propertyId]?.filter((p) => p.period === period) ?? [];

  const grossRent = amortization
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + r.baseRent, 0);
  const grossAdmin = amortization
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + r.baseAdmin, 0);
  const grossLateFee = amortization
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + r.lateFeeAmount, 0);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);

  // Estimación de settlement (sin retefuente si canon <= 27 UVT)
  // La comisión por default es 8% — el cálculo preciso lo hace el backend
  // cuando está disponible (loadPolicy + contract.commission_pct).
  const commissionPct = 8;
  const baseGross = grossRent + grossLateFee;
  const comision = Math.round(baseGross * (commissionPct / 100));
  const ivaOnComision = Math.round(comision * 0.19);
  const baseGmf = Math.max(0, baseGross - comision - ivaOnComision);
  const gmf = Math.round(baseGmf * 0.004);
  const netCalculated = Math.max(
    0,
    baseGross + grossAdmin - comision - ivaOnComision - gmf - totalDiscounts,
  );

  // discounts en formato legacy PropertyDiscount para UI ya en producción
  const discountsLegacy: PropertyDiscount[] = allOwnerCharges.map((c) => ({
    id: c.id,
    propertyId: c.propertyId,
    type: c.type as any,
    description: c.description,
    amount: c.amount,
    monthPeriod: c.period,
    attachmentUrl: c.attachmentUrl,
    recordedAt: c.recordedAt,
    recordedBy: c.recordedBy,
  }));

  return {
    propertyId,
    period,
    grossRent,
    grossAdmin,
    grossLateFee,
    totalGrossIncome: grossRent + grossAdmin + grossLateFee,
    totalDiscounts,
    discounts: discountsLegacy,
    charges: allOwnerCharges,
    settlement: {
      commission: comision,
      ivaOnCommission: ivaOnComision,
      retefuente: 0,
      gmf,
      totalRetentions: comision + ivaOnComision + gmf,
      commissionPct,
    },
    netCalculated,
    totalPayouts,
    payouts,
    totalChargesToTenant,
    finalBalance: netCalculated - totalPayouts,
  };
}
