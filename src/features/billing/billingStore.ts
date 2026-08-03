/**
 * InmoControl — Billing Store
 * ============================================================================
 * Store de Zustand con persistencia en localStorage. Contiene el estado
 * de billing: BillingPolicy, PropertyDiscount, RentIncrease, AmortizationRow,
 * RentInvoice, PropertyAction.
 *
 * HOY: persiste en localStorage (clave `inmocontrol:billing:v1`).
 * MAÑANA (Fase 5 — backend): el `api.ts` stub se reemplaza por fetch a
 * `/api/billing/*` y este store se hidrata desde el servidor.
 *
 * El log de acciones es APPEND-ONLY: nunca se borran ni modifican entries.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AmortizationRow,
  BillingPolicy,
  OwnerPayout,
  PropertyAction,
  PropertyActionType,
  PropertyCharge,
  PropertyDiscount,
  RentIncrease,
  RentInvoice,
} from './types';
import { chargeToDiscount, genId } from './types';

interface BillingState {
  /** BillingPolicy indexada por propertyId. */
  billingPolicies: Record<string, BillingPolicy>;
  /** Tabla de amortización por contractId. */
  amortization: Record<string, AmortizationRow[]>;
  /** Descuentos por propertyId. SOLO compat — los registros nuevos viven en `charges`. */
  discounts: Record<string, PropertyDiscount[]>;
  /** Aumentos por propertyId. */
  increases: Record<string, RentIncrease[]>;
  /** Facturas generadas por propertyId. */
  invoices: Record<string, RentInvoice[]>;
  /** Transferencias reales al propietario, indexadas por propertyId. */
  payouts: Record<string, OwnerPayout[]>;
  /** Histórico append-only de acciones por propertyId. */
  actions: Record<string, PropertyAction[]>;
  /**
   * Novedades de cargos por propertyId. Fuente de verdad unificada desde
   * la migración 011_property_charges.sql.
   * (BUG-031: antes era 006_property_charges.sql, renombrada para no chocar
   * con 006_password_hash.sql.)
   */
  charges: Record<string, PropertyCharge[]>;

  // ─── Actions ────────────────────────────────────────────
  setBillingPolicy: (propertyId: string, policy: BillingPolicy) => void;
  getBillingPolicy: (propertyId: string) => BillingPolicy | undefined;

  setAmortization: (contractId: string, rows: AmortizationRow[]) => void;
  getAmortization: (contractId: string) => AmortizationRow[];
  updateAmortizationRow: (contractId: string, row: AmortizationRow) => void;

  /**
   * @deprecated Mantener por compat. Los cargos nuevos van a `addCharge`.
   */
  addDiscount: (propertyId: string, discount: Omit<PropertyDiscount, 'id' | 'recordedAt'>) => void;
  /**
   * @deprecated Mantener por compat. Para cargos nuevos usar `getCharges`.
   */
  getDiscounts: (propertyId: string) => PropertyDiscount[];

  /** Registra una novedad de cargo en la propiedad. */
  addCharge: (propertyId: string, charge: Omit<PropertyCharge, 'id' | 'recordedAt'>) => void;
  /** Devuelve todas las novedades (cargo) de la propiedad. */
  getCharges: (propertyId: string) => PropertyCharge[];
  /** Elimina una novedad por id. */
  removeCharge: (propertyId: string, chargeId: string) => void;

  addIncrease: (propertyId: string, increase: Omit<RentIncrease, 'id' | 'recordedAt'>) => void;
  getIncreases: (propertyId: string) => RentIncrease[];

  setInvoices: (propertyId: string, invoices: RentInvoice[]) => void;
  updateInvoice: (propertyId: string, invoice: RentInvoice) => void;
  getInvoices: (propertyId: string) => RentInvoice[];

  /** Reemplaza o agrega un payout real al propietario. */
  addPayout: (propertyId: string, payout: OwnerPayout) => void;
  /** Elimina un payout por id (usado cuando se borra/rectifica). */
  removePayout: (propertyId: string, payoutId: string) => void;
  /** Devuelve los payouts de la propiedad. */
  getPayouts: (propertyId: string) => OwnerPayout[];

  recordAction: (
    propertyId: string,
    type: PropertyActionType,
    description: string,
    actorName: string,
    payload?: Record<string, any>
  ) => PropertyAction;
  getActions: (propertyId: string) => PropertyAction[];

  reset: () => void;
}

const initialState = {
  billingPolicies: {} as Record<string, BillingPolicy>,
  amortization: {} as Record<string, AmortizationRow[]>,
  discounts: {} as Record<string, PropertyDiscount[]>,
  increases: {} as Record<string, RentIncrease[]>,
  invoices: {} as Record<string, RentInvoice[]>,
  payouts: {} as Record<string, OwnerPayout[]>,
  actions: {} as Record<string, PropertyAction[]>,
  charges: {} as Record<string, PropertyCharge[]>,
};

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setBillingPolicy: (propertyId, policy) =>
        set((s) => ({ billingPolicies: { ...s.billingPolicies, [propertyId]: policy } })),

      getBillingPolicy: (propertyId) => get().billingPolicies[propertyId],

      setAmortization: (contractId, rows) =>
        set((s) => ({ amortization: { ...s.amortization, [contractId]: rows } })),

      getAmortization: (contractId) => get().amortization[contractId] ?? [],

      updateAmortizationRow: (contractId, row) =>
        set((s) => {
          const current = s.amortization[contractId] ?? [];
          return {
            amortization: {
              ...s.amortization,
              [contractId]: current.map((r) => (r.id === row.id ? row : r)),
            },
          };
        }),

      addDiscount: (propertyId, discount) => {
        const id = genId('disc-');
        const recordedAt = new Date().toISOString();
        set((s) => ({
          discounts: {
            ...s.discounts,
            [propertyId]: [...(s.discounts[propertyId] ?? []), { id, recordedAt, ...discount }],
          },
        }));
      },

      getDiscounts: (propertyId) => get().discounts[propertyId] ?? [],

      addCharge: (propertyId, charge) => {
        const id = genId('chg-');
        const recordedAt = new Date().toISOString();
        set((s) => ({
          charges: {
            ...s.charges,
            [propertyId]: [...(s.charges[propertyId] ?? []), { id, recordedAt, ...charge }],
          },
        }));
      },

      getCharges: (propertyId) => get().charges[propertyId] ?? [],

      removeCharge: (propertyId, chargeId) => {
        set((s) => ({
          charges: {
            ...s.charges,
            [propertyId]: (s.charges[propertyId] ?? []).filter((c) => c.id !== chargeId),
          },
        }));
      },

      addIncrease: (propertyId, increase) => {
        const id = genId('inc-');
        const recordedAt = new Date().toISOString();
        set((s) => ({
          increases: {
            ...s.increases,
            [propertyId]: [...(s.increases[propertyId] ?? []), { id, recordedAt, ...increase }],
          },
        }));
      },

      getIncreases: (propertyId) => get().increases[propertyId] ?? [],

      setInvoices: (propertyId, invoices) =>
        set((s) => ({ invoices: { ...s.invoices, [propertyId]: invoices } })),

      updateInvoice: (propertyId, invoice) =>
        set((s) => {
          const current = s.invoices[propertyId] ?? [];
          const exists = current.find((i) => i.id === invoice.id);
          return {
            invoices: {
              ...s.invoices,
              [propertyId]: exists
                ? current.map((i) => (i.id === invoice.id ? invoice : i))
                : [...current, invoice],
            },
          };
        }),

      getInvoices: (propertyId) => get().invoices[propertyId] ?? [],

      addPayout: (propertyId, payout) =>
        set((s) => {
          const current = s.payouts[propertyId] ?? [];
          const exists = current.find((p) => p.id === payout.id);
          return {
            payouts: {
              ...s.payouts,
              [propertyId]: exists
                ? current.map((p) => (p.id === payout.id ? payout : p))
                : [...current, payout],
            },
          };
        }),

      removePayout: (propertyId, payoutId) =>
        set((s) => ({
          payouts: {
            ...s.payouts,
            [propertyId]: (s.payouts[propertyId] ?? []).filter((p) => p.id !== payoutId),
          },
        })),

      getPayouts: (propertyId) => get().payouts[propertyId] ?? [],

      recordAction: (propertyId, type, description, actorName, payload) => {
        const action: PropertyAction = {
          id: genId('act-'),
          propertyId,
          type,
          description,
          actorName,
          payload,
          occurredAt: new Date().toISOString(),
        };
        set((s) => ({
          actions: {
            ...s.actions,
            [propertyId]: [...(s.actions[propertyId] ?? []), action],
          },
        }));
        return action;
      },

      getActions: (propertyId) => get().actions[propertyId] ?? [],

      reset: () => set(initialState),
    }),
    {
      name: 'inmocontrol:billing:v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// Selectores finos
export const selectBillingPolicyById = (s: BillingState, propertyId: string) => s.billingPolicies[propertyId];
export const selectAmortizationByContractId = (s: BillingState, contractId: string) => s.amortization[contractId] ?? [];
export const selectDiscountsByPropertyId = (s: BillingState, propertyId: string) => s.discounts[propertyId] ?? [];
export const selectIncreasesByPropertyId = (s: BillingState, propertyId: string) => s.increases[propertyId] ?? [];
export const selectInvoicesByPropertyId = (s: BillingState, propertyId: string) => s.invoices[propertyId] ?? [];
export const selectPayoutsByPropertyId = (s: BillingState, propertyId: string) => s.payouts[propertyId] ?? [];
export const selectActionsByPropertyId = (s: BillingState, propertyId: string) => s.actions[propertyId] ?? [];
export const selectChargesByPropertyId = (s: BillingState, propertyId: string) => s.charges[propertyId] ?? [];
