// filepath: src/shared/store/appStore/slices/tenantsSlice.ts
// Slice: CRUD de tenants (add, update, remove).
import type { StateCreator } from "zustand";
import type { Tenant } from "../../../../types";
import type { AppState } from "../types";
import { apiCall } from "../api";

export const createTenantsSlice: StateCreator<
  AppState,
  [],
  [],
  Pick<AppState, "addTenant" | "updateTenant" | "removeTenant">
> = (set) => ({
  // ── Tenants ─────────────────────────────────────────────────────────
  addTenant: async (t) => {
    try {
      const data = await apiCall("POST", "/api/tenants", t);
      const created: Tenant = {
        id: data.tenantId,
        name: t.name ?? "",
        idNumber: t.idNumber ?? "",
        email: t.email,
        phone: t.phone,
        propertyId: t.propertyId ?? "",
        rent: t.rent ?? 0,
        adminFee: t.adminFee ?? 0,
        status: "Activo",
        leaseStartDate:
          t.leaseStartDate ?? new Date().toISOString().slice(0, 10),
        tenantDriveFolderId:
          data.tenantDriveFolderId ?? t.tenantDriveFolderId ?? null,
        ...t,
      } as Tenant;
      set((s) => ({ tenants: [...s.tenants, created] }));

      // IMPORTANTE: NO creamos contrato acá. El orden legal del proceso es:
      //   1) Propiedad creada (wizard 3 pasos + mandato firmado → "Activo")
      //   2) Tenant creado (propiedad → "En Colocación")
      //   3) Cédula del tenant subida a Drive
      //   4) Inventario de Colocación firmado por arrendatario + agente
      //   5) → Recién AHORA se crea el contrato (en TenantsView.onComplete
      //      del StepInventory, junto con el flip de status → "Arrendado")
      //   6) Recién con contrato activo se puede habilitar billing/recibos.
      //
      // Crear contrato antes del paso 4 era ilegal/operativo: el contrato
      // existía sin que el arrendatario hubiera firmado el inventario de
      // colocación, y el billing podía cobrar cánones de un arrendamiento
      // que legalmente aún no estaba cerrado.

      return created;
    } catch (err: any) {
      console.error("[store] addTenant failed:", err);
      set({ error: err.message });
      return null;
    }
  },

  updateTenant: async (id, patch) => {
    try {
      await apiCall("PATCH", `/api/tenants/${id}`, patch);
      set((s) => ({
        tenants: s.tenants.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
      return true;
    } catch (err: any) {
      console.error("[store] updateTenant failed:", err);
      return false;
    }
  },

  removeTenant: async (id) => {
    try {
      await apiCall("DELETE", `/api/tenants/${id}`);
      set((s) => ({ tenants: s.tenants.filter((t) => t.id !== id) }));
    } catch (err: any) {
      console.error("[store] removeTenant failed:", err);
    }
  },
});
