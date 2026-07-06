/**
 * API client para SaaS Billing (Fase 8).
 *
 * Wrapper de fetch para los endpoints `/api/saas-billing/*`. Maneja errores
 * de forma uniforme y devuelve JSON tipado.
 *
 * Si el server no responde (503 / red), los componentes caen a modo demo
 * con datos de localStorage del store.
 */

import type {
  Plan,
  Subscription,
  PaymentMethod,
  SaasInvoice,
  PaymentMethodType,
} from './types';

const BASE = '/api/saas-billing';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.error ?? data?.message ?? msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

// ─── Plans ──────────────────────────────────────────────────────────────

export const plansApi = {
  /** Lista planes activos (catálogo público). */
  list: () => call<Plan[]>(`/plans`),
  /** Lista TODOS los planes, incluyendo inactivos (admin). */
  listAll: () => call<Plan[]>(`/plans/all`),
  get: (id: string) => call<Plan>(`/plans/${id}`),
  create: (data: Omit<Plan, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> & { isActive?: boolean }) =>
    call<Plan>(`/plans`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, patch: Partial<Plan>) =>
    call<Plan>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  remove: (id: string) =>
    call<{ ok: boolean; deactivated: boolean; activeSubscriptions?: number }>(`/plans/${id}`, { method: 'DELETE' }),
};

// ─── Subscription ───────────────────────────────────────────────────────

export const subscriptionApi = {
  get: () => call<Subscription | null>(`/subscription`),
  /** Subscribe o cambia de plan. Mock pay: emite invoice paid inmediato. */
  subscribe: (planId: string, paymentMethodId?: string) =>
    call<{
      subscription: Subscription;
      plan: Plan;
      invoiceId: string;
      invoiceNumber: string;
    }>(`/subscription`, { method: 'POST', body: JSON.stringify({ planId, paymentMethodId }) }),
  /** Cancela al final del periodo actual (no inmediato). */
  cancel: () => call<{ ok: boolean; message: string }>(`/subscription`, { method: 'DELETE' }),
  reactivate: () => call<{ ok: boolean }>(`/subscription/reactivate`, { method: 'POST' }),
};

// ─── PaymentMethods ─────────────────────────────────────────────────────

export interface PaymentMethodInput {
  type: PaymentMethodType;
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  holderName?: string;
  details?: Record<string, unknown>;
  makeDefault?: boolean;
}

export const paymentMethodsApi = {
  list: () => call<PaymentMethod[]>(`/payment-methods`),
  create: (data: PaymentMethodInput) =>
    call<PaymentMethod>(`/payment-methods`, { method: 'POST', body: JSON.stringify(data) }),
  remove: (id: string) =>
    call<{ ok: boolean }>(`/payment-methods/${id}`, { method: 'DELETE' }),
  setDefault: (id: string) =>
    call<{ ok: boolean }>(`/payment-methods/${id}/default`, { method: 'PUT' }),
};

// ─── Invoices ───────────────────────────────────────────────────────────

export const invoicesApi = {
  list: () => call<SaasInvoice[]>(`/invoices`),
  get: (id: string) => call<SaasInvoice>(`/invoices/${id}`),
  /** Mock pay (PSP real en el futuro). */
  pay: (id: string, paymentMethodId?: string) =>
    call<{ ok: boolean; invoice: SaasInvoice }>(`/invoices/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethodId }),
    }),
};

export { ApiError };
