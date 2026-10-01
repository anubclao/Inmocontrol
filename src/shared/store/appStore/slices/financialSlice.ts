// filepath: src/shared/store/appStore/slices/financialSlice.ts
// Slice: CRUD de financial records (add, update, remove).
import type { StateCreator } from "zustand";
import type { FinancialRecord } from "../../types";
import type { AppState } from "../types";
import { apiCall } from "../api";

export const createFinancialSlice: StateCreator<
  AppState,
  [],
  [],
  Pick<
    AppState,
    "addFinancialRecord" | "updateFinancialRecord" | "removeFinancialRecord"
  >
> = (set) => ({
  // ── Financial ───────────────────────────────────────────────────────
  addFinancialRecord: async (r) => {
    try {
      const data = await apiCall("POST", "/api/financial-records", r);
      const created: FinancialRecord = {
        id: data.recordId,
        ...r,
      } as FinancialRecord;
      set((s) => ({ financialRecords: [...s.financialRecords, created] }));
      return created;
    } catch (err: any) {
      console.error("[store] addFinancialRecord failed:", err);
      set({ error: err.message });
      return null;
    }
  },

  updateFinancialRecord: async (id, patch) => {
    try {
      await apiCall("PATCH", `/api/financial-records/${id}`, patch);
      set((s) => ({
        financialRecords: s.financialRecords.map((r) =>
          r.id === id ? { ...r, ...patch } : r,
        ),
      }));
    } catch (err: any) {
      console.error("[store] updateFinancialRecord failed:", err);
    }
  },

  removeFinancialRecord: async (id) => {
    try {
      await apiCall("DELETE", `/api/financial-records/${id}`);
      set((s) => ({
        financialRecords: s.financialRecords.filter((r) => r.id !== id),
      }));
    } catch (err: any) {
      console.error("[store] removeFinancialRecord failed:", err);
    }
  },
});
