// filepath: src/shared/store/appStore.ts
// Store global de InmoControl (Zustand). Compone 5 slices por dominio.
import { create } from "zustand";
import type { AppState } from "./appStore/types";
import { initialState } from "./appStore/api";
import { createPropertiesFetchSlice } from "./appStore/slices/propertiesFetchSlice";
import { createPropertiesCrudSlice } from "./appStore/slices/propertiesCrudSlice";
import { createTenantsSlice } from "./appStore/slices/tenantsSlice";
import { createFinancialSlice } from "./appStore/slices/financialSlice";
import { createHydrateSlice } from "./appStore/slices/hydrateSlice";

export const useAppStore = create<AppState>()((...a) => ({
  ...initialState,
  ...createPropertiesFetchSlice(...a),
  ...createPropertiesCrudSlice(...a),
  ...createTenantsSlice(...a),
  ...createFinancialSlice(...a),
  ...createHydrateSlice(...a),
  reset: () => a[0](initialState),
}));

// Re-exports para compat con importadores existentes.
export {
  selectProperties,
  selectTenants,
  selectFinancialRecords,
} from "./appStore/selectors";
export { STORAGE_KEYS } from "../hooks/storageKeys";
