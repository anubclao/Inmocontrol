// filepath: src/features/tenants/hooks/useCreateTenant.ts
// Hook que orquesta el ciclo de vida del form de creación de tenant.
// El state, la validación, el POST y el side effect de cambiar la
// propiedad a "En Colocación" están separados en:
//   - createTenantForm.ts (validateCreateForm, formatColombianPhone)
//   - createTenantSubmit.ts (submitCreateTenant)
//
// Este hook solo mantiene el state, expone los handlers, y une todo.
//
// Antes toda esta lógica vivía inline en TenantsView.tsx (~330 líneas);
// este refactor (fix-issue-06) lo extrae para que el componente padre
// solo orqueste modales y el JSX del form viva en CreateTenantModal.tsx.

import { useState, type ChangeEvent } from "react";
import { formatColombianPhone, validateCreateForm } from "./createTenantForm";
import { submitCreateTenant } from "./createTenantSubmit";
import type { Tenant } from "../types";

export type CreateTenantForm = {
  name: string;
  idNumber: string;
  email: string;
  phone: string;
  propertyId: string;
  rent: string;
  adminFee: string;
};

export interface UseCreateTenantDeps {
  properties: any[];
  tenants: Tenant[];
  onAddTenant: (tenant: any) => void;
  onUpdateProperty: (id: string, updates: any) => Promise<boolean>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export interface UseCreateTenantResult {
  form: CreateTenantForm;
  formErrors: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<CreateTenantForm>>;
  setFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  confirmCreateOpen: boolean;
  setConfirmCreateOpen: (open: boolean) => void;
  creatingTenant: boolean;
  handleAskCreate: () => void;
  handleConfirmAndCreate: () => Promise<void>;
  handleIdNumberChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleCloseCreate: () => void;
  propertyIdsWithActiveTenant: Set<string>;
  formatColombianPhone: (raw: string) => string;
}

const EMPTY_FORM: CreateTenantForm = {
  name: "",
  idNumber: "",
  email: "",
  phone: "",
  propertyId: "",
  rent: "",
  adminFee: "",
};

export function useCreateTenant(
  deps: UseCreateTenantDeps,
): UseCreateTenantResult {
  const { properties, tenants, onAddTenant, onUpdateProperty, showToast } =
    deps;

  const [form, setForm] = useState<CreateTenantForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  // FIX 2026-07-22: loading state para que el modal muestre "Guardando..."
  // mientras el POST corre. Sin esto, el modal se cierra antes de que el
  // server responda y el usuario no sabe si el guardado fue OK o no.
  const [creatingTenant, setCreatingTenant] = useState(false);

  // Defensa contra duplicados: aunque el status del property diga
  // "Pendiente"/"Activo" pero ya exista un tenant Activo apuntando a este
  // propertyId (caso de bug histórico o edición manual del status), también
  // lo bloqueamos acá.
  const propertyIdsWithActiveTenant = new Set(
    tenants
      .filter((t) => t.status === "Activo" && t.propertyId)
      .map((t) => t.propertyId),
  );

  const handleAskCreate = () => {
    const { errors, isValid } = validateCreateForm(form, tenants);
    setFormErrors(errors);
    if (!isValid) return;
    setConfirmCreateOpen(true);
  };

  const handleConfirmAndCreate = async () => {
    setCreatingTenant(true);
    try {
      const result = await submitCreateTenant({
        form,
        properties,
        propertyIdsWithActiveTenant,
        onAddTenant,
        onUpdateProperty,
        showToast,
      });
      if (result.ok) {
        setForm(EMPTY_FORM);
        setFormErrors({});
        setIsCreateModalOpen(false);
      }
      // Si !ok && !canClose (BUG-023), dejamos el form + modal abiertos
      // para que el agente decida. Si !ok && canClose, ya mostramos el
      // error y el modal puede cerrarse con "Modificar" o un reintento.
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleIdNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setForm((f) => ({ ...f, idNumber: raw }));
    if (formErrors.idNumber) {
      const cleanId = raw.replace(/[^0-9]/g, "");
      const exists = tenants.some(
        (t) => t.idNumber.replace(/[^0-9]/g, "") === cleanId,
      );
      if (!exists) {
        setFormErrors((er) => ({ ...er, idNumber: "" }));
      }
    }
  };

  const handleCloseCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setIsCreateModalOpen(false);
  };

  return {
    form,
    formErrors,
    setForm,
    setFormErrors,
    isCreateModalOpen,
    setIsCreateModalOpen,
    confirmCreateOpen,
    setConfirmCreateOpen,
    creatingTenant,
    handleAskCreate,
    handleConfirmAndCreate,
    handleIdNumberChange,
    handleCloseCreate,
    propertyIdsWithActiveTenant,
    formatColombianPhone,
  };
}
