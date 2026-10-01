// filepath: src/features/billing/api/insuranceApi.ts
// ─── Insurance Policies ──────────────────────────────────────────────

import { api, tryBackendOrFallbackValue } from "./_internal";
import type { PolicyInfo } from "../types";

/** Devuelve la última póliza de seguros de una propiedad, o null. */
export async function getInsurancePolicy(
  propertyId: string,
): Promise<PolicyInfo | null> {
  return tryBackendOrFallbackValue(
    async () => {
      const rows = await api<any[]>(
        "GET",
        `/billing/insurance-policies/${encodeURIComponent(propertyId)}`,
      );
      const latest = rows?.[0];
      if (!latest) return null;
      return {
        insurer: latest.insurer,
        policyNumber: latest.policy_number,
        startDate: latest.start_date,
        endDate: latest.end_date,
        premiumAmount: Number(latest.premium_amount),
        approvalPdfDataUrl: latest.approval_pdf_url ?? undefined,
        approvedAt: latest.approved_at,
        approvedBy: latest.approved_by,
        notes: latest.notes ?? undefined,
      };
    },
    () => null,
  );
}

/** Persiste una póliza de seguros (server-only — no hay cache local). */
export async function saveInsurancePolicy(
  p: PolicyInfo & { propertyId: string },
): Promise<void> {
  await tryBackendOrFallbackValue(
    async () => {
      await api("POST", "/billing/insurance-policies", {
        propertyId: p.propertyId,
        insurer: p.insurer,
        policyNumber: p.policyNumber,
        startDate: p.startDate,
        endDate: p.endDate,
        premiumAmount: p.premiumAmount,
        approvalPdfUrl: p.approvalPdfDataUrl,
        approvedBy: p.approvedBy,
        notes: p.notes,
      });
    },
    () => {
      /* no-op local */
    },
  );
}
