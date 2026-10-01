// filepath: src/shared/store/appStore/selectors.ts
// Selectores finos del store global. Re-exportados desde appStore.ts (barrel).
import type { AppState } from "./types";

export const selectProperties = (s: AppState) => s.properties;
export const selectTenants = (s: AppState) => s.tenants;
export const selectFinancialRecords = (s: AppState) => s.financialRecords;
