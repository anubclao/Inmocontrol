/**
 * Tipos del módulo SaaS Subscription Billing (Fase 8).
 *
 * NO confundir con `src/features/billing/types.ts` (que es el billing de
 * PROPIEDADES: arriendos, amortización, BillingPolicy). Este módulo es la
 * subscripción al SaaS InmoControl.
 *
 * Multi-tenant ready: cada org tiene su propia subscripción.
 * PSP: MOCK por ahora (sin Wompi/MercadoPago real). Cuando se enchufe un
 * PSP, este módulo solo cambia la implementación del adapter — los tipos
 * quedan.
 */

// ─── Plan ────────────────────────────────────────────────────────────────

/** Catálogo de planes. La org elige uno y queda con su subscripción. */
export interface Plan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  /** Precio mensual en COP, sin decimales. */
  priceCop: number;
  /** Límite duro de inmuebles activos en la org. */
  maxProperties: number;
  /** Límite de usuarios (agentes) en la org. */
  maxUsers: number;
  /** Límite de alertas enviadas por mes. */
  maxAlertsPerMonth: number;
  /** Lista de features (string) para mostrar en UI. */
  features: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Subscription ───────────────────────────────────────────────────────

/** Status posibles del ciclo de vida de una subscripción. */
export type SubscriptionStatus =
  | 'trialing'      // en trial (no implementado aún)
  | 'active'        // activa, pagada
  | 'past_due'      // periodo pasó, sin pago
  | 'canceled'      // cancelada (periodo ya terminó)
  | 'unpaid';       // intentos de pago fallaron

/** Subscripción actual de la org (UNIQUE por organization_id). */
export interface Subscription {
  id: string;
  planId: string;
  status: SubscriptionStatus;
  /** Inicio del periodo actual de facturación. ISO YYYY-MM-DD. */
  currentPeriodStart: string;
  /** Fin del periodo actual. ISO YYYY-MM-DD. */
  currentPeriodEnd: string;
  /** true = se cancelará al final del periodo actual. */
  cancelAtPeriodEnd: boolean;
  startedAt: string;
  canceledAt?: string;
}

// ─── PaymentMethod ──────────────────────────────────────────────────────

export type PaymentMethodType = 'card' | 'pse' | 'nequi' | 'bancolombia';

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  // Card-only
  brand?: string;        // visa, mastercard, amex, ...
  last4?: string;        // 4 dígitos
  expiryMonth?: number;
  expiryYear?: number;
  holderName?: string;
  // Otros (PSE = banco + cuenta, etc.)
  details?: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
}

// ─── SaasInvoice ────────────────────────────────────────────────────────

export type SaasInvoiceStatus = 'open' | 'paid' | 'void' | 'uncollectible';

export interface SaasInvoice {
  id: string;
  invoiceNumber: string;
  subscriptionId: string;
  paymentMethodId?: string;
  /** Inicio del periodo facturado. */
  periodStart: string;
  /** Fin del periodo facturado. */
  periodEnd: string;
  /** Monto base (sin IVA) en COP. */
  subtotalCop: number;
  /** IVA 19% colombiano. */
  ivaCop: number;
  /** Total a pagar (subtotal + iva). */
  totalCop: number;
  status: SaasInvoiceStatus;
  issuedAt: string;
  paidAt?: string;
  /** Snapshot del plan al momento de facturar (por si cambia después). */
  planSnapshot?: Partial<Plan>;
}

// ─── Plan usage / limits (derivado en runtime) ──────────────────────────

/** Resumen de uso vs límites del plan actual. */
export interface PlanUsage {
  propertiesUsed: number;
  propertiesLimit: number;
  usersUsed: number;
  usersLimit: number;
  /** % del límite de propiedades consumido (0..1+). */
  propertiesPct: number;
  isAtPropertyLimit: boolean;
  isNearPropertyLimit: boolean; // ≥ 80%
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** IVA colombiano estándar. */
export const COLOMBIA_IVA_RATE = 0.19;

/** Calcula IVA desde un subtotal COP. */
export function calcIva(subtotalCop: number): number {
  return Math.round(subtotalCop * COLOMBIA_IVA_RATE);
}

/** Formatea COP sin decimales: $149.000 */
export function formatCop(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Inputs de API ─────────────────────────────────────────────────────

/** Payload para POST /payment-methods — re-export del api.ts para conveniencia. */
export type { PaymentMethodInput } from './api';

/** Payload para POST /plans — excluye campos server-generated. */
export interface PlanCreateInput {
  slug: string;
  name: string;
  description?: string;
  priceCop: number;
  maxProperties: number;
  maxUsers: number;
  maxAlertsPerMonth: number;
  features?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

/** Payload para PUT /plans/:id — todos los campos son opcionales, slug inmutable. */
export type PlanUpdateInput = Partial<Omit<PlanCreateInput, 'slug'>>;
