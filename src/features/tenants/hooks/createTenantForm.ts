// filepath: src/features/tenants/hooks/createTenantForm.ts
// Funciones puras del flujo de creación de tenant. Separadas del hook
// (useCreateTenant) para mantener el hook <200 líneas.
//
// - formatColombianPhone: 3001234567 → 300 123 4567
// - validateForm: corre las 6 validaciones del form y devuelve un map
//   de errores (vacío si todo OK)
//
// Antes vivían inline en TenantsView.tsx (líneas 280-403 del monolito).
// Extraído en fix-issue-06.

import type { CreateTenantForm } from "./useCreateTenant";
import type { Tenant } from "../types";

/** Formato colombiano del celular: 3001234567 -> 300 123 4567. */
export const formatColombianPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
};

export interface ValidateFormResult {
  errors: Record<string, string>;
  isValid: boolean;
}

/** Valida el form de creación de tenant. Devuelve un map de errores (vacío
 *  si todo OK). El componente padre es responsable de mergear esto en su
 *  state `formErrors` (lo hacemos así para mantener la función pura y
 *  testeable de forma aislada). */
export const validateCreateForm = (
  form: CreateTenantForm,
  existingTenants: Tenant[],
): ValidateFormResult => {
  const errors: Record<string, string> = {};
  const name = String(form.name ?? "").trim();
  const idNumber = String(form.idNumber ?? "");
  const email = String(form.email ?? "").trim();
  const phone = String(form.phone ?? "");
  const propertyId = String(form.propertyId ?? "");
  const rent = String(form.rent ?? "");
  const adminFee = String(form.adminFee ?? "");

  if (!name) {
    errors.name = "El nombre es obligatorio";
  }

  const cleanId = idNumber.replace(/[^0-9]/g, "");
  if (!idNumber || cleanId.length < 6) {
    errors.idNumber = "La cédula debe tener al menos 6 dígitos";
  } else if (
    existingTenants.some(
      (t) => (t.idNumber ?? "").replace(/[^0-9]/g, "") === cleanId,
    )
  ) {
    errors.idNumber = "Ya existe un arrendatario con esta cédula";
  }

  // Email: obligatorio + formato válido (caso típico: falta el @)
  if (!email) {
    errors.email = "El correo electrónico es obligatorio";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Correo inválido (ej: nombre@dominio.com)";
  }

  // Celular colombiano: obligatorio + exactamente 10 dígitos
  const cleanPhone = phone.replace(/\D/g, "");
  if (!phone.trim()) {
    errors.phone = "El celular es obligatorio";
  } else if (cleanPhone.length !== 10) {
    errors.phone = `El celular debe tener 10 dígitos (tiene ${cleanPhone.length})`;
  } else if (!cleanPhone.startsWith("3")) {
    errors.phone = "Celular colombiano debe iniciar con 3";
  }

  if (!propertyId) {
    errors.propertyId = "Selecciona un inmueble";
  }

  // Canon mensual: obligatorio, en pesos COP, > 0
  const cleanRent = rent.replace(/[^0-9]/g, "");
  const rentValue = cleanRent ? parseInt(cleanRent, 10) : 0;
  if (!rent.trim() || rentValue <= 0) {
    errors.rent = "Ingresa el canon mensual en pesos (COP)";
  }

  // Cuota de administración: opcional; si se ingresa, debe ser un monto válido en COP
  if (adminFee.trim()) {
    const cleanAdminFee = adminFee.replace(/[^0-9]/g, "");
    if (!cleanAdminFee) {
      errors.adminFee = "Ingresa la cuota en pesos (COP) — solo números";
    } else if (parseInt(cleanAdminFee, 10) < 0) {
      errors.adminFee = "La cuota no puede ser negativa";
    }
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
};
