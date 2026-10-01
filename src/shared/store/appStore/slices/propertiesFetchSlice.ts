// filepath: src/shared/store/appStore/slices/propertiesFetchSlice.ts
// Slice: refetch de properties + flags de invalidación + setLastCreatedPropertyId.
import type { StateCreator } from "zustand";
import type { AppState } from "../types";
import { apiCall, mapServerProperty } from "../api";

export const createPropertiesFetchSlice: StateCreator<
  AppState,
  [],
  [],
  Pick<
    AppState,
    "fetchProperties" | "invalidatePropertiesList" | "setLastCreatedPropertyId"
  >
> = (set, get) => ({
  /**
   * Marca la lista de properties como stale. El próximo `fetchProperties()`
   * va a ignorar la cache y refetchear. Llamado por:
   *  - `handleFinalize` en PropertiesView (después de crear una propiedad)
   *  - otros wizards que mutan properties (archive, restore, etc.)
   */
  invalidatePropertiesList: () => {
    set({ propertiesListStale: true });
  },

  /**
   * Setea el id de la propiedad recién creada por el wizard. Lo consume
   * `PropertiesView` para mostrar el highlight azul de 3s en la card
   * correspondiente. Spec AC-3.3.
   */
  setLastCreatedPropertyId: (id: string | null) => {
    set({ lastCreatedPropertyId: id });
  },

  /**
   * Refetch de SOLO properties. Usado por:
   *  - `useEffect` de mount en PropertiesView (AC-3.1)
   *  - `handleFinalize` (AC-3.2: que la nueva aparezca sin F5)
   *  - invalidaciones manuales vía `invalidatePropertiesList()`
   *
   * Reglas:
   *  - Si `propertiesListStale=true` → siempre refetch.
   *  - Si `force=true` → siempre refetch.
   *  - Si no hay stale ni force y los datos son frescos (< 60s) → noop.
   */
  fetchProperties: async (opts?: { force?: boolean }) => {
    const { propertiesListStale, lastPropertiesFetchedAt } = get();
    const force = opts?.force === true;
    const isFresh =
      lastPropertiesFetchedAt !== null &&
      Date.now() - lastPropertiesFetchedAt < 60_000;
    if (!force && !propertiesListStale && isFresh) {
      // Noop — datos frescos y no hay invalidación pendiente.
      return;
    }
    try {
      const data = (await apiCall("GET", "/api/properties")) as {
        properties?: any[];
      };
      const properties = (data?.properties ?? []).map(mapServerProperty);
      set({
        properties,
        lastPropertiesFetchedAt: Date.now(),
        propertiesListStale: false,
      });
    } catch (err: any) {
      // No rompemos la app si el refetch falla — solo log.
      console.warn("[fetchProperties] refetch falló:", err?.message ?? err);
    }
  },
});
