// filepath: src/features/billing/views/billingPanel/hooks/useBillingActions.ts
/**
 * useBillingActions — hook que agrupa los handlers "simples" de BillingPanel:
 *  - handleSavePolicy: guardar policy
 *  - handleRegenerate: regenerar amortización
 *  - handleAddCharge / handleRemoveCharge: CRUD de cargos
 *  - handleAddIncrease: registrar aumento
 *
 * Sale de BillingPanel.tsx como parte del refactor #12.
 * NO incluye handleSendInvoice ni handlePay (esos viven en `useBillingInvoice`).
 */
import { useCallback, useState } from "react";
import {
  addPropertyCharge,
  addRentIncrease,
  getOrGenerateAmortization,
  logAction,
  removePropertyCharge,
  saveBillingPolicy,
} from "../../../api";
import type {
  AmortizationRow,
  BillingPolicy,
  Contract,
  PropertyCharge,
  RentIncrease,
} from "../../../types";
import { formatCurrency } from "../../../../../utils/calculations";
import type { Property } from "../../../../../types";

interface UseBillingActionsParams {
  property: Property;
  selectedContract: Contract | null;
  policy: BillingPolicy | null;
  userName: string;
  showToast: (msg: string, type: "success" | "error") => void;
}

export interface UseBillingActionsReturn {
  saving: boolean;
  generating: boolean;
  setCharges: React.Dispatch<React.SetStateAction<PropertyCharge[]>>;
  setIncreases: React.Dispatch<React.SetStateAction<RentIncrease[]>>;
  setRows: React.Dispatch<React.SetStateAction<AmortizationRow[]>>;
  handleSavePolicy: (policyDraft: BillingPolicy | null) => Promise<void>;
  handleRegenerate: () => Promise<void>;
  handleAddCharge: (
    data: Omit<PropertyCharge, "id" | "recordedAt">,
  ) => Promise<void>;
  handleRemoveCharge: (chargeId: string) => Promise<void>;
  handleAddIncrease: (
    data: Omit<RentIncrease, "id" | "recordedAt">,
  ) => Promise<void>;
}

export function useBillingActions({
  property,
  selectedContract,
  policy,
  userName,
  showToast,
}: UseBillingActionsParams): UseBillingActionsReturn {
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [charges, setCharges] = useState<PropertyCharge[]>([]);
  const [increases, setIncreases] = useState<RentIncrease[]>([]);
  const [rows, setRows] = useState<AmortizationRow[]>([]);

  const handleSavePolicy = useCallback(
    async (policyDraft: BillingPolicy | null) => {
      if (!policyDraft) return;
      setSaving(true);
      try {
        await saveBillingPolicy(policyDraft);
        await logAction(
          property.id,
          "billing_policy_updated",
          `Política actualizada: canon ${formatCurrency(policyDraft.rentAmount)} + admin ${formatCurrency(policyDraft.adminFee)}`,
          userName,
        );
        showToast("Política guardada", "success");
      } catch (err: any) {
        showToast(`Error guardando: ${err?.message ?? err}`, "error");
      } finally {
        setSaving(false);
      }
    },
    [property.id, userName, showToast],
  );

  const handleRegenerate = useCallback(async () => {
    if (!policy || !selectedContract) return;
    setGenerating(true);
    try {
      const fresh = await getOrGenerateAmortization(selectedContract, policy);
      setRows(fresh);
      showToast(`Amortización regenerada (${fresh.length} meses)`, "success");
    } catch (err: any) {
      showToast(`Error: ${err?.message ?? err}`, "error");
    } finally {
      setGenerating(false);
    }
  }, [policy, selectedContract, showToast]);

  const handleAddCharge = useCallback(
    async (data: Omit<PropertyCharge, "id" | "recordedAt">) => {
      const created = await addPropertyCharge(property.id, data);
      setCharges((prev) => [created, ...prev]);
      const destinatario =
        data.chargedTo === "owner"
          ? "al propietario"
          : data.chargedTo === "tenant"
            ? "al inquilino"
            : "a ambos";
      await logAction(
        property.id,
        "discount_registered",
        `Novedad ${data.chargedTo === "owner" ? "descuento" : "cargo"} de ${formatCurrency(data.amount)} (${data.description}) en ${data.period} (${destinatario})`,
        userName,
      );
      showToast(
        `Novedad de ${formatCurrency(data.amount)} registrada (${destinatario})`,
        "success",
      );
    },
    [property.id, userName, showToast],
  );

  const handleRemoveCharge = useCallback(
    async (chargeId: string) => {
      await removePropertyCharge(property.id, chargeId);
      setCharges((prev) => prev.filter((c) => c.id !== chargeId));
      showToast("Novedad eliminada", "success");
    },
    [property.id, showToast],
  );

  const handleAddIncrease = useCallback(
    async (data: Omit<RentIncrease, "id" | "recordedAt">) => {
      if (!selectedContract) return;
      const created = await addRentIncrease(property.id, {
        ...data,
        contractId: selectedContract.id,
      });
      setIncreases((prev) => [created, ...prev]);
      const desc =
        data.type === "ipc_annual"
          ? `IPC de ${data.amount}% desde ${data.effectiveFrom}`
          : `Nueva administración ${formatCurrency(data.amount)} desde ${data.effectiveFrom}`;
      await logAction(property.id, "increase_registered", desc, userName);
      showToast(
        "Aumento registrado. Regenerá la amortización para aplicarlo.",
        "success",
      );
    },
    [property.id, selectedContract, userName, showToast],
  );

  return {
    saving,
    generating,
    setCharges,
    setIncreases,
    setRows,
    handleSavePolicy,
    handleRegenerate,
    handleAddCharge,
    handleRemoveCharge,
    handleAddIncrease,
  };
}
