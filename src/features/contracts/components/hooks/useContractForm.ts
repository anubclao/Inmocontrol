// filepath: src/features/contracts/components/hooks/useContractForm.ts
/**
 * useContractForm — hook que encapsula el state y los handlers del form
 * de contratos: state inicial, onTenantChange (autofill desde canon del tenant),
 * onPropertyChange (autofill desde tenant activo de la propiedad), useEffect
 * de autofill al mount.
 *
 * Sale de ContractForm.tsx como parte del refactor #13 (commit 2 hotfix).
 * Mantiene la lógica del FIX Karpathy jul-2026 sin que el componente de
 * presentación se infle.
 */
import { useEffect, useState } from "react";
import type { Contract } from "../../contractTypes";

interface UseContractFormParams {
  contract?: Contract;
  properties: any[];
  tenants: any[];
}

export interface UseContractFormReturn {
  form: Contract;
  setForm: React.Dispatch<React.SetStateAction<Contract>>;
  onTenantChange: (tenantId: string) => void;
  onPropertyChange: (propertyId: string) => void;
}

function initialContract(
  contract: Contract | undefined,
  properties: any[],
  tenants: any[],
): Contract {
  if (contract) return contract;
  return {
    id: `contract-${Date.now()}`,
    propertyId: properties.find((p: any) => p.status !== "Arrendado")?.id ?? "",
    tenantId: tenants[0]?.id ?? "",
    rentAmount: 0,
    adminFee: 0,
    commissionPct: 8,
    insurancePct: 0,
    startDate: new Date().toISOString().split("T")[0],
    endDate: (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().split("T")[0];
    })(),
    status: "draft",
    renewalStrategy: "manual",
    inventoryEndRequired: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function useContractForm({
  contract,
  properties,
  tenants,
}: UseContractFormParams): UseContractFormReturn {
  const [form, setForm] = useState<Contract>(() =>
    initialContract(contract, properties, tenants),
  );

  const onTenantChange = (tenantId: string) => {
    const t = tenants.find((x: any) => x.id === tenantId);
    setForm((f) => ({
      ...f,
      tenantId,
      rentAmount: f.rentAmount > 0 ? f.rentAmount : Number(t?.rent ?? 0) || 0,
      adminFee: f.adminFee > 0 ? f.adminFee : Number(t?.adminFee ?? 0) || 0,
    }));
  };

  const onPropertyChange = (propertyId: string) => {
    const t = tenants.find(
      (x: any) => x.propertyId === propertyId && x.status === "Activo",
    );
    setForm((f) => ({
      ...f,
      propertyId,
      tenantId: t?.id ?? f.tenantId,
      rentAmount: f.rentAmount > 0 ? f.rentAmount : Number(t?.rent ?? 0) || 0,
      adminFee: f.adminFee > 0 ? f.adminFee : Number(t?.adminFee ?? 0) || 0,
    }));
  };

  // FIX Karpathy (jul-2026): auto-fill al mount del modal
  useEffect(() => {
    if (contract) return;
    if (!form.propertyId) return;
    setForm((f) => {
      if (f.rentAmount > 0 || f.adminFee > 0) return f;
      const t = tenants.find(
        (x: any) => x.propertyId === f.propertyId && x.status === "Activo",
      );
      if (!t) return f;
      return {
        ...f,
        tenantId: t.id,
        rentAmount: Number(t.rent ?? 0) || 0,
        adminFee: Number(t.adminFee ?? 0) || 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.propertyId, tenants, properties, contract]);

  return { form, setForm, onTenantChange, onPropertyChange };
}
