/**
 * SaasBillingView — vista customer-facing del módulo SaaS Billing (Fase 8).
 *
 * Lo que ve el dueño de la agencia:
 *   1. Estado actual: plan vigente + fecha renovación + estado (activa/cancelará)
 *   2. Catálogo de planes (cards) — click → modal de confirmación
 *   3. Métodos de pago — lista + modal para agregar (mock: solo metadata)
 *   4. Historial de facturas — lista + botón "Pagar" si está open
 *
 * Reemplaza el placeholder estático en `SettingsView.tsx`.
 */

import { useEffect, useMemo, useState, type Key } from 'react';
import { motion } from 'motion/react';
import {
  Check, X, CreditCard, ShieldCheck, AlertTriangle, Loader2,
  Calendar, Receipt, Wallet, Edit3, Trash2, Star, Plus, Crown,
} from 'lucide-react';
import { Button, Card, Modal, Input, cn } from '../../shared/ui';
import { useSaasBillingStore, selectCurrentPlan } from './saasBillingStore';
import type { Plan, PaymentMethodInput, PaymentMethodType } from './types';
import { calcIva, formatCop } from './types';

export interface SaasBillingViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: 'Activa', cls: 'bg-emerald-100 text-emerald-700' },
  trialing: { label: 'En trial', cls: 'bg-sky-100 text-sky-700' },
  past_due: { label: 'Pago pendiente', cls: 'bg-amber-100 text-amber-700' },
  canceled: { label: 'Cancelada', cls: 'bg-slate-200 text-slate-600' },
  unpaid: { label: 'Impaga', cls: 'bg-red-100 text-red-700' },
};

export function SaasBillingView({ showToast }: SaasBillingViewProps) {
  const {
    plans,
    currentSubscription,
    paymentMethods,
    invoices,
    loading,
    serverReachable,
    lastSyncAt,
    hydrate,
    subscribe,
    cancelSubscription,
    reactivateSubscription,
    addPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
    payInvoice,
  } = useSaasBillingStore();

  const currentPlan = useSaasBillingStore(selectCurrentPlan);

  // ── UI state
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [addPmOpen, setAddPmOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const sub = currentSubscription;

  return (
    <div className="space-y-6">
      {/* ── Estado del server ── */}
      <ServerReachabilityBanner
        serverReachable={serverReachable}
        lastSyncAt={lastSyncAt}
        loading={loading}
        onRetry={hydrate}
      />

      {/* ── Banner del plan actual ── */}
      <CurrentPlanBanner
        plan={currentPlan}
        subscription={sub}
        loading={loading}
        onCancel={() => setConfirmCancel(true)}
        onReactivate={() => reactivateSubscription().then(() => showToast('Subscripción reactivada', 'success')).catch((e) => showToast(e.message, 'error'))}
      />

      {/* ── Catálogo de planes ── */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Planes disponibles
          </h3>
          <p className="text-xs text-slate-500">
            Elegí el plan que mejor se ajuste al tamaño de tu inmobiliaria. Cambiá cuando quieras.
          </p>
        </div>
        {plans.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-6 text-center">
            {loading ? 'Cargando planes…' : 'No hay planes activos. Contactá al administrador.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                current={sub?.planId === plan.id}
                onSelect={() => setConfirmPlan(plan)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ── Métodos de pago ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              Métodos de pago
            </h3>
            <p className="text-xs text-slate-500">
              Guardamos solo metadata visible (últimos 4 + marca). El PAN nunca toca nuestros servidores.
            </p>
          </div>
          <Button size="sm" onClick={() => setAddPmOpen(true)} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Agregar método
          </Button>
        </div>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-4">
            Sin métodos de pago. Agregá uno para poder subscribirte a un plan pago.
          </p>
        ) : (
          <ul className="space-y-2">
            {paymentMethods.map((pm) => (
              <PaymentMethodRow
                key={pm.id}
                pm={pm}
                onSetDefault={() => setDefaultPaymentMethod(pm.id).then(() => showToast('Método marcado como default', 'success')).catch((e) => showToast(e.message, 'error'))}
                onRemove={() => {
                  if (confirm(`¿Eliminar método ${pm.brand?.toUpperCase() ?? pm.type} ${pm.last4 ?? ''}?`)) {
                    removePaymentMethod(pm.id).then(() => showToast('Método eliminado', 'success')).catch((e) => showToast(e.message, 'error'));
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* ── Facturas ── */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            Historial de facturas
          </h3>
          <p className="text-xs text-slate-500">
            Todas las facturas de tu subscripción al SaaS. IVA 19% desglosado.
          </p>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-4">Sin facturas aún.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {invoices.map((inv) => (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                onPay={async () => {
                  const defaultPm = paymentMethods.find((pm) => pm.isDefault);
                  try {
                    await payInvoice(inv.id, defaultPm?.id);
                    showToast('Factura pagada (mock)', 'success');
                  } catch (e: any) {
                    showToast(e.message ?? 'Error al pagar', 'error');
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* ── Modales ── */}
      <Modal
        isOpen={!!confirmPlan}
        onClose={() => setConfirmPlan(null)}
        title={confirmPlan ? `Confirmar plan: ${confirmPlan.name}` : ''}
      >
        {confirmPlan && (
          <ConfirmPlanSubscribe
            plan={confirmPlan}
            paymentMethods={paymentMethods}
            onConfirm={async (paymentMethodId) => {
              try {
                await subscribe(confirmPlan.id, paymentMethodId);
                showToast(`¡Plan ${confirmPlan.name} activado!`, 'success');
                setConfirmPlan(null);
              } catch (e: any) {
                showToast(e.message ?? 'Error al subscribirse', 'error');
              }
            }}
            onCancel={() => setConfirmPlan(null)}
          />
        )}
      </Modal>

      <Modal
        isOpen={addPmOpen}
        onClose={() => setAddPmOpen(false)}
        title="Agregar método de pago"
      >
        <AddPaymentMethodForm
          onCancel={() => setAddPmOpen(false)}
          onSave={async (data) => {
            try {
              await addPaymentMethod(data);
              showToast('Método de pago agregado', 'success');
              setAddPmOpen(false);
            } catch (e: any) {
              showToast(e.message ?? 'Error al agregar método', 'error');
            }
          }}
        />
      </Modal>

      <Modal
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancelar subscripción"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            ¿Estás seguro? Tu subscripción se cancelará al final del periodo actual
            ({sub ? new Date(sub.currentPeriodEnd).toLocaleDateString('es-CO') : '—'}),
            pero seguirá activa hasta entonces. Podés reactivarla antes de esa fecha.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>No, mantener</Button>
            <Button
              onClick={async () => {
                try {
                  await cancelSubscription();
                  showToast('Subscripción se cancelará al final del periodo', 'success');
                  setConfirmCancel(false);
                } catch (e: any) {
                  showToast(e.message ?? 'Error al cancelar', 'error');
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Sí, cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────

function ServerReachabilityBanner({
  serverReachable, lastSyncAt, loading, onRetry,
}: { serverReachable: boolean; lastSyncAt: string | null; loading: boolean; onRetry: () => void }) {
  if (serverReachable) {
    return (
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Sincronizado{lastSyncAt && ` · ${new Date(lastSyncAt).toLocaleTimeString('es-CO')}`}
        </span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
    );
  }
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-amber-900">
        <p className="font-semibold">Servidor no disponible</p>
        <p>Mostrando datos de la última sincronización local. Algunas acciones pueden fallar.</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>Reintentar</Button>
    </div>
  );
}

function CurrentPlanBanner({
  plan, subscription, loading, onCancel, onReactivate,
}: {
  plan: Plan | null;
  subscription: { planId: string; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean } | null;
  loading: boolean;
  onCancel: () => void;
  onReactivate: () => void;
}) {
  if (loading && !plan) {
    return (
      <Card className="p-6 animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
      </Card>
    );
  }
  if (!plan || !subscription) {
    return (
      <Card className="p-6 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
        <div className="flex items-start gap-3">
          <Crown className="w-6 h-6 text-amber-600 shrink-0" />
          <div className="flex-1">
            <h3 className="font-bold text-slate-900">Sin subscripción activa</h3>
            <p className="text-sm text-slate-600 mt-1">
              Elegí un plan abajo para empezar a usar InmoControl.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  const statusBadge = STATUS_LABEL[subscription.status] ?? STATUS_LABEL.active;
  return (
    <Card className="p-6 bg-gradient-to-br from-blue-50 via-white to-blue-50 border-blue-200">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Crown className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-xl text-slate-900">Plan {plan.name}</h3>
              <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusBadge.cls)}>
                {statusBadge.label}
              </span>
              {subscription.cancelAtPeriodEnd && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Se cancelará
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {formatCop(plan.priceCop)}/mes · {plan.maxProperties} inmuebles · {plan.maxUsers} usuarios · {plan.maxAlertsPerMonth.toLocaleString('es-CO')} alertas/mes
            </p>
            <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {subscription.cancelAtPeriodEnd
                ? `Termina el ${new Date(subscription.currentPeriodEnd).toLocaleDateString('es-CO')}`
                : `Próxima renovación: ${new Date(subscription.currentPeriodEnd).toLocaleDateString('es-CO')}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {subscription.cancelAtPeriodEnd ? (
            <Button variant="outline" onClick={onReactivate} className="gap-1">
              <Check className="w-3.5 h-3.5" /> Reactivar
            </Button>
          ) : (
            <Button variant="outline" onClick={onCancel} className="gap-1 text-red-600 border-red-100 hover:bg-red-50">
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function PlanCard({ plan, current, onSelect, key: _key }: { plan: Plan; current: boolean; onSelect: () => void; key?: Key }) {
  const isFree = plan.priceCop === 0;
  return (
    <div className={cn(
      'p-5 rounded-2xl border-2 transition-all flex flex-col',
      current ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300',
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="font-bold text-lg text-slate-900">{plan.name}</h4>
          {plan.description && <p className="text-xs text-slate-500 mt-0.5">{plan.description}</p>}
        </div>
        {current && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-600 text-white shrink-0">
            Actual
          </span>
        )}
      </div>
      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-900">
            {isFree ? 'Gratis' : formatCop(plan.priceCop)}
          </span>
          {!isFree && <span className="text-xs text-slate-500">/mes</span>}
        </div>
        {!isFree && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            + IVA {formatCop(calcIva(plan.priceCop))} · Total {formatCop(plan.priceCop + calcIva(plan.priceCop))}
          </p>
        )}
      </div>
      <ul className="space-y-1.5 mb-5 flex-1">
        {plan.features.map((feat, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span>{feat}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={onSelect}
        disabled={current}
        variant={current ? 'outline' : 'primary'}
        className="w-full"
      >
        {current ? 'Plan actual' : isFree ? 'Elegir Free' : `Cambiar a ${plan.name}`}
      </Button>
    </div>
  );
}

function PaymentMethodRow({
  pm, onSetDefault, onRemove, key: _key,
}: {
  pm: { id: string; type: string; brand?: string; last4?: string; expiryMonth?: number; expiryYear?: number; holderName?: string; isDefault: boolean };
  onSetDefault: () => void;
  onRemove: () => void;
  key?: Key;
}) {
  const label = pm.type === 'card'
    ? `${(pm.brand ?? 'card').toUpperCase()} •••• ${pm.last4 ?? '????'}`
    : pm.type === 'pse' ? 'PSE' : pm.type === 'nequi' ? 'Nequi' : 'Bancolombia';
  const sub = pm.type === 'card' && pm.expiryMonth && pm.expiryYear
    ? `Vence ${String(pm.expiryMonth).padStart(2, '0')}/${pm.expiryYear}${pm.holderName ? ` · ${pm.holderName}` : ''}`
    : null;
  return (
    <li className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          'p-2 rounded-lg shrink-0',
          pm.type === 'card' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600',
        )}>
          {pm.type === 'card' ? <CreditCard className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{label}</span>
            {pm.isDefault && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" /> Default
              </span>
            )}
          </div>
          {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!pm.isDefault && (
          <Button size="sm" variant="ghost" onClick={onSetDefault} className="text-blue-600 hover:text-blue-700">
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRemove} className="text-slate-400 hover:text-red-600">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </li>
  );
}

function InvoiceRow({ inv, onPay, key: _key }: { inv: { id: string; invoiceNumber: string; periodStart: string; periodEnd: string; totalCop: number; ivaCop: number; subtotalCop: number; status: string; issuedAt: string; paidAt?: string }; onPay: () => void; key?: Key }) {
  const isOpen = inv.status === 'open';
  return (
    <li className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 transition-colors gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold text-slate-900">{inv.invoiceNumber}</span>
          <span className={cn(
            'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full',
            inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
            inv.status === 'open' ? 'bg-amber-100 text-amber-700' :
            'bg-slate-200 text-slate-600',
          )}>
            {inv.status}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Periodo {new Date(inv.periodStart).toLocaleDateString('es-CO')} → {new Date(inv.periodEnd).toLocaleDateString('es-CO')}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-slate-900">{formatCop(inv.totalCop)}</p>
        <p className="text-[10px] text-slate-400">IVA {formatCop(inv.ivaCop)}</p>
      </div>
      {isOpen && (
        <Button size="sm" onClick={onPay} className="shrink-0">
          Pagar
        </Button>
      )}
    </li>
  );
}

function ConfirmPlanSubscribe({
  plan, paymentMethods, onConfirm, onCancel,
}: {
  plan: Plan;
  paymentMethods: { id: string; isDefault: boolean; brand?: string; last4?: string; type: string }[];
  onConfirm: (paymentMethodId?: string) => void;
  onCancel: () => void;
}) {
  const defaultPm = paymentMethods.find((pm) => pm.isDefault) ?? paymentMethods[0];
  const [selectedPm, setSelectedPm] = useState<string | undefined>(defaultPm?.id);
  const iva = calcIva(plan.priceCop);
  const total = plan.priceCop + iva;
  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Plan {plan.name}</span>
          <span className="text-sm font-bold text-slate-900">{formatCop(plan.priceCop)}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-500">IVA 19%</span>
          <span className="text-xs text-slate-700">{formatCop(iva)}</span>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
          <span className="text-sm font-bold text-slate-900">Total mensual</span>
          <span className="text-lg font-bold text-blue-600">{formatCop(total)}</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Método de pago</label>
        {paymentMethods.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
            No tenés métodos de pago. Agregá uno antes de subscribirte a un plan pago.
            Para planes Free no es necesario.
          </p>
        ) : (
          <select
            value={selectedPm}
            onChange={(e) => setSelectedPm(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
          >
            {paymentMethods.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {pm.type === 'card' ? `${(pm.brand ?? 'card').toUpperCase()} •••• ${pm.last4 ?? ''}` : pm.type.toUpperCase()}
                {pm.isDefault ? ' (Default)' : ''}
              </option>
            ))}
          </select>
        )}
        <p className="text-[11px] text-slate-400 mt-1">
          MOCK: no se hace cargo real. Cuando se enchufe Wompi/MercadoPago, este botón dispara el checkout del PSP.
        </p>
      </div>

      <div className="pt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={() => onConfirm(selectedPm)}
          disabled={plan.priceCop > 0 && !selectedPm}
        >
          Confirmar y pagar
        </Button>
      </div>
    </div>
  );
}

function AddPaymentMethodForm({
  onCancel, onSave,
}: {
  onCancel: () => void;
  onSave: (data: PaymentMethodInput) => void;
}) {
  const [type, setType] = useState<PaymentMethodType>('card');
  const [brand, setBrand] = useState('visa');
  const [last4, setLast4] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [holderName, setHolderName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);

  const canSave = type === 'card'
    ? (last4.length === 4 && expMonth && expYear && holderName)
    : true;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tipo</label>
        <div className="flex gap-2 flex-wrap">
          {(['card', 'pse', 'nequi', 'bancolombia'] as PaymentMethodType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                type === t ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {t === 'card' ? '💳 Tarjeta' : t === 'pse' ? '🏦 PSE' : t === 'nequi' ? '💜 Nequi' : '🟡 Bancolombia'}
            </button>
          ))}
        </div>
      </div>
      {type === 'card' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Marca</label>
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white">
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
                <option value="amex">Amex</option>
                <option value="diners">Diners</option>
              </select>
            </div>
            <Input label="Últimos 4" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4242" maxLength={4} inputMode="numeric" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Mes" value={expMonth} onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="MM" maxLength={2} inputMode="numeric" />
            <Input label="Año" value={expYear} onChange={(e) => setExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="YYYY" maxLength={4} inputMode="numeric" />
            <Input label="Titular" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Como aparece en la tarjeta" />
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
          Para {type.toUpperCase()} la integración real con el PSP se hace en el siguiente paso. Por ahora guardamos un placeholder.
        </p>
      )}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="rounded" />
        <span className="text-slate-700">Marcar como método default</span>
      </label>
      <div className="pt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => {
          const data: PaymentMethodInput = type === 'card'
            ? { type, brand, last4, expiryMonth: Number(expMonth), expiryYear: Number(expYear), holderName, makeDefault }
            : { type, makeDefault, details: { placeholder: true } };
          onSave(data);
        }} disabled={!canSave}>Guardar</Button>
      </div>
    </div>
  );
}
