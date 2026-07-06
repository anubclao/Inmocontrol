/**
 * Store de SaaS Billing (Fase 8) — Zustand con persist.
 *
 * Maneja:
 *  - Catálogo de planes (cacheado en localStorage para no pegar al server)
 *  - Subscripción actual de la org
 *  - Métodos de pago
 *  - Facturas (últimas 200)
 *
 * Patrón:
 *  - Carga inicial: hydrate() pega al backend, refresca state
 *  - Fallback: si el server no responde, mantiene los datos persistidos
 *    (modo offline / demo)
 *  - Acciones: mutan local + sincronizan con backend cuando aplica
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Plan,
  Subscription,
  PaymentMethod,
  SaasInvoice,
  PaymentMethodInput,
  PlanCreateInput,
  PlanUpdateInput,
} from './types';
import {
  plansApi,
  subscriptionApi,
  paymentMethodsApi,
  invoicesApi,
} from './api';

interface SaasBillingState {
  // ── Estado
  plans: Plan[];
  currentSubscription: Subscription | null;
  paymentMethods: PaymentMethod[];
  invoices: SaasInvoice[];
  loading: boolean;
  lastSyncAt: string | null;
  /** Si el último hydrate falló (server caído / 503). */
  serverReachable: boolean;
  error: string | null;

  // ── Acciones: hydrate
  hydrate: () => Promise<void>;
  refreshPlans: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  refreshPaymentMethods: () => Promise<void>;
  refreshInvoices: () => Promise<void>;

  // ── Acciones: planes (admin)
  createPlan: (data: PlanCreateInput) => Promise<Plan>;
  updatePlan: (id: string, patch: PlanUpdateInput) => Promise<Plan>;
  removePlan: (id: string) => Promise<{ deactivated: boolean; activeSubscriptions?: number }>;

  // ── Acciones: subscripción
  subscribe: (planId: string, paymentMethodId?: string) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  reactivateSubscription: () => Promise<void>;

  // ── Acciones: métodos de pago
  addPaymentMethod: (data: PaymentMethodInput) => Promise<PaymentMethod>;
  removePaymentMethod: (id: string) => Promise<void>;
  setDefaultPaymentMethod: (id: string) => Promise<void>;

  // ── Acciones: facturas
  payInvoice: (id: string, paymentMethodId?: string) => Promise<void>;

  reset: () => void;
}

export const useSaasBillingStore = create<SaasBillingState>()(
  persist(
    (set, get) => ({
      plans: [],
      currentSubscription: null,
      paymentMethods: [],
      invoices: [],
      loading: false,
      lastSyncAt: null,
      serverReachable: true,
      error: null,

      // ── Hydrate ──────────────────────────────────────────────────────
      hydrate: async () => {
        set({ loading: true, error: null });
        try {
          await Promise.all([
            get().refreshPlans(),
            get().refreshSubscription(),
            get().refreshPaymentMethods(),
            get().refreshInvoices(),
          ]);
          set({ serverReachable: true, lastSyncAt: new Date().toISOString() });
        } catch (err: any) {
          set({
            serverReachable: false,
            error: err?.message ?? 'Error al sincronizar con el servidor',
          });
        } finally {
          set({ loading: false });
        }
      },

      refreshPlans: async () => {
        try {
          const plans = await plansApi.list();
          set({ plans });
        } catch {
          // silencioso — el catálogo puede estar vacío en cold start
        }
      },

      refreshSubscription: async () => {
        const sub = await subscriptionApi.get();
        set({ currentSubscription: sub });
      },

      refreshPaymentMethods: async () => {
        const pms = await paymentMethodsApi.list();
        set({ paymentMethods: pms });
      },

      refreshInvoices: async () => {
        const invs = await invoicesApi.list();
        set({ invoices: invs });
      },

      // ── Planes ───────────────────────────────────────────────────────
      createPlan: async (data) => {
        const created = await plansApi.create(data as any);
        set((s) => ({ plans: [...s.plans, created].sort((a, b) => a.sortOrder - b.sortOrder) }));
        return created;
      },

      updatePlan: async (id, patch) => {
        const updated = await plansApi.update(id, patch as any);
        set((s) => ({
          plans: s.plans.map((p) => (p.id === id ? updated : p)).sort((a, b) => a.sortOrder - b.sortOrder),
        }));
        return updated;
      },

      removePlan: async (id) => {
        const res = await plansApi.remove(id);
        set((s) => ({ plans: s.plans.filter((p) => p.id !== id) }));
        return { deactivated: res.deactivated, activeSubscriptions: res.activeSubscriptions };
      },

      // ── Subscription ────────────────────────────────────────────────
      subscribe: async (planId, paymentMethodId) => {
        const res = await subscriptionApi.subscribe(planId, paymentMethodId);
        set({ currentSubscription: res.subscription });
        // Refrescar invoices para incluir la recién creada
        await get().refreshInvoices();
      },

      cancelSubscription: async () => {
        await subscriptionApi.cancel();
        await get().refreshSubscription();
      },

      reactivateSubscription: async () => {
        await subscriptionApi.reactivate();
        await get().refreshSubscription();
      },

      // ── Payment Methods ──────────────────────────────────────────────
      addPaymentMethod: async (data) => {
        const pm = await paymentMethodsApi.create(data);
        // Si la nueva es default, refrescar la lista para que las demás aparezcan como !default
        await get().refreshPaymentMethods();
        return pm;
      },

      removePaymentMethod: async (id) => {
        await paymentMethodsApi.remove(id);
        set((s) => ({ paymentMethods: s.paymentMethods.filter((pm) => pm.id !== id) }));
      },

      setDefaultPaymentMethod: async (id) => {
        await paymentMethodsApi.setDefault(id);
        await get().refreshPaymentMethods();
      },

      // ── Invoices ─────────────────────────────────────────────────────
      payInvoice: async (id, paymentMethodId) => {
        await invoicesApi.pay(id, paymentMethodId);
        await get().refreshInvoices();
      },

      reset: () =>
        set({
          plans: [],
          currentSubscription: null,
          paymentMethods: [],
          invoices: [],
          loading: false,
          lastSyncAt: null,
          serverReachable: true,
          error: null,
        }),
    }),
    {
      name: 'inmocontrol:saas-billing:v1',
      storage: createJSONStorage(() => localStorage),
      // Solo persistimos data, NO flags de UI
      partialize: (s) => ({
        plans: s.plans,
        currentSubscription: s.currentSubscription,
        paymentMethods: s.paymentMethods,
        invoices: s.invoices,
        lastSyncAt: s.lastSyncAt,
      }),
      version: 1,
    },
  ),
);

// ─── Selectores finos ─────────────────────────────────────────────────

/** Devuelve el plan correspondiente a la subscripción actual (o null). */
export function selectCurrentPlan(state: SaasBillingState): Plan | null {
  if (!state.currentSubscription) return null;
  return state.plans.find((p) => p.id === state.currentSubscription!.planId) ?? null;
}

/** Resumen de uso vs límites del plan actual. */
export function selectPlanUsage(state: SaasBillingState, propertiesUsed: number, usersUsed: number) {
  const plan = selectCurrentPlan(state);
  if (!plan) {
    return {
      propertiesUsed,
      propertiesLimit: 0,
      usersUsed,
      usersLimit: 0,
      propertiesPct: 0,
      isAtPropertyLimit: false,
      isNearPropertyLimit: false,
    };
  }
  const pct = plan.maxProperties > 0 ? propertiesUsed / plan.maxProperties : 0;
  return {
    propertiesUsed,
    propertiesLimit: plan.maxProperties,
    usersUsed,
    usersLimit: plan.maxUsers,
    propertiesPct: pct,
    isAtPropertyLimit: propertiesUsed >= plan.maxProperties,
    isNearPropertyLimit: pct >= 0.8,
  };
}
