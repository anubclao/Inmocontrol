// filepath: src/shared/store/appStore/slices/propertiesCrudSlice.ts
// Slice: CRUD de properties (add, update, remove). Mapper server→client.
import type { StateCreator } from "zustand";
import type { Property } from "../../../../types";
import type { AppState } from "../types";
import { apiCall } from "../api";

export const createPropertiesCrudSlice: StateCreator<
  AppState,
  [],
  [],
  Pick<AppState, "addProperty" | "updateProperty" | "removeProperty">
> = (set) => ({
  // ── Properties ──────────────────────────────────────────────────────
  addProperty: async (p) => {
    // FIX: si la propiedad YA fue creada en el server (viene con `id` del response),
    // NO la posteamos de nuevo — solo actualizamos el state local. Antes esto causaba
    // un POST duplicado a /api/properties sin localId → server trataba como INSERT
    // y creaba otra carpeta en Drive para la misma propiedad.
    if (p.id) {
      // BUG-020: mover ...p ANTES de los defaults para que no los pise.
      // Antes, si p.chip era undefined, el spread al final reescribia
      // chip: '' con chip: undefined → cards renderizaban `undefined`.
      // FIX #9: createdAt优先使用server返回的created_at，回退到本地时间。
      const local: Property = {
        ...p,
        id: p.id,
        address: p.address ?? "",
        chip: p.chip ?? "",
        folio: p.folio ?? "",
        ownerId: p.ownerId ?? "",
        owner: p.owner ?? p.ownerName ?? "",
        ownerName: p.owner ?? p.ownerName ?? "",
        ownerIdNumber: p.ownerIdNumber ?? "",
        status: p.status ?? "Activo",
        propertyType: p.propertyType,
        driveFolderId: p.driveFolderId ?? null,
        driveFolderPath: p.driveFolderPath ?? null,
        inventoryPdfUrl: p.inventoryPdfUrl ?? null,
        mandatePdfUrl: p.mandatePdfUrl ?? null,
        mandateSignedAt: p.mandateSignedAt ?? null,
        // FIX #9: server response优先 (viene como created_at); fallback ISO local
        createdAt:
          (p as any).createdAt ??
          (p as any).created_at ??
          new Date().toISOString(),
      } as Property;
      set((s) => ({ properties: [...s.properties, local] }));
      return local;
    }
    // Sin id: sí crear remotamente (caso de un futuro "quick add" sin wizard)
    try {
      const data = await apiCall("POST", "/api/properties", p);
      // BUG-020: mismo fix — spread al principio, defaults al final.
      const created: Property = {
        ...p,
        id: data.propertyId,
        address: p.address ?? "",
        chip: p.chip ?? "",
        folio: p.folio ?? "",
        ownerId: p.ownerId ?? "",
        owner: p.owner ?? p.ownerName ?? "",
        ownerName: p.owner ?? p.ownerName ?? "",
        ownerIdNumber: p.ownerIdNumber ?? "",
        status: p.status ?? "Activo",
        propertyType: p.propertyType,
        driveFolderId: data.driveFolderId ?? p.driveFolderId ?? null,
        driveFolderPath: data.driveFolderPath ?? null,
        inventoryPdfUrl: p.inventoryPdfUrl ?? null,
        mandatePdfUrl: p.mandatePdfUrl ?? null,
        mandateSignedAt: p.mandateSignedAt ?? null,
        // FIX #9: usar createdAt del server si está disponible; fallback ISO local
        createdAt:
          data.createdAt ?? data.created_at ?? new Date().toISOString(),
      } as Property;
      set((s) => ({ properties: [...s.properties, created] }));
      return created;
    } catch (err: any) {
      console.error("[store] addProperty failed:", err);
      set({ error: err.message });
      return null;
    }
  },

  updateProperty: async (id, patch) => {
    // BUG-023: antes swalloweaba el error y retornaba void. Eso hacía que
    // el caller (TenantsView.handleConfirmAndCreate) pensara que el PATCH
    // había funcionado, mostrara toast de éxito, y quedara con el tenant
    // creado en MySQL pero la propiedad sin actualizar.
    // Ahora: si el server devuelve error, lo re-throw para que el caller
    // pueda decidir qué hacer (mostrar toast de error, no cerrar el modal,
    // etc). BUG-003 ya aplicó el mismo patrón en updateTenant.
    try {
      await apiCall("PATCH", `/api/properties/${id}`, patch);
      set((s) => ({
        properties: s.properties.map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        ),
      }));
    } catch (err: any) {
      console.error("[store] updateProperty failed:", err);
      set({ error: err.message });
      throw err;
    }
  },

  removeProperty: async (
    id,
  ): Promise<
    | { ok: true; driveCleanupStatus: string }
    | { ok: false; error: string; hasInventories?: boolean }
  > => {
    try {
      const data = await apiCall<{
        success: boolean;
        driveCleanupStatus?: string;
        error?: string;
        hasInventories?: boolean;
      }>("DELETE", `/api/properties/${id}`);
      if (!data.success) {
        return { ok: false, error: data.error ?? "Error desconocido" };
      }
      set((s) => ({ properties: s.properties.filter((p) => p.id !== id) }));
      return {
        ok: true,
        driveCleanupStatus: data.driveCleanupStatus ?? "skipped",
      };
    } catch (err: any) {
      console.error("[store] removeProperty failed:", err);
      const msg = err?.message ?? "Error eliminando propiedad";
      // Para distinguir el 409 (con inventario) del resto
      const hasInv = msg.includes("inventario");
      return { ok: false, error: msg, hasInventories: hasInv };
    }
  },
});
