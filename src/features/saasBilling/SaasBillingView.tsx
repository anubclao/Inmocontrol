/**
 * SaasBillingView — vista customer-facing del módulo SaaS Billing (Fase 8).
 *
 * Refactor #16: los 7 sub-componentes se extrajeron a `components/`. El
 * componente principal queda como orquestador.
 */

import { useEffect, useState } from "react";
import { Crown, Plus, Receipt, Wallet } from "lucide-react";
import { Button, Card, Modal } from "../../shared/ui";
import { useSaasBillingStore, selectCurrentPlan } from "./saasBillingStore";
import type { Plan } from "./types";
import { ServerReachabilityBanner } from "./components/ServerReachabilityBanner";
import { CurrentPlanBanner } from "./components/CurrentPlanBanner";
import { PlanCard } from "./components/PlanCard";
import { PaymentMethodRow } from "./components/PaymentMethodRow";
import { InvoiceRow } from "./components/InvoiceRow";
import { ConfirmPlanSubscribe } from "./components/ConfirmPlanSubscribe";
import { AddPaymentMethodForm } from "./components/AddPaymentMethodForm";

export interface SaasBillingViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
}

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
        onReactivate={() =>
          reactivateSubscription()
            .then(() => showToast("Subscripción reactivada", "success"))
            .catch((e) => showToast(e.message, "error"))
        }
      />

      {/* ── Catálogo de planes ── */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Planes disponibles
          </h3>
          <p className="text-xs text-slate-500">
            Elegí el plan que mejor se ajuste al tamaño de tu inmobiliaria.
            Cambiá cuando quieras.
          </p>
        </div>
        {plans.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-6 text-center">
            {loading
              ? "Cargando planes…"
              : "No hay planes activos. Contactá al administrador."}
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
              Guardamos solo metadata visible (últimos 4 + marca). El PAN nunca
              toca nuestros servidores.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setAddPmOpen(true)}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar método
          </Button>
        </div>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-4">
            Sin métodos de pago. Agregá uno para poder subscribirte a un plan
            pago.
          </p>
        ) : (
          <ul className="space-y-2">
            {paymentMethods.map((pm) => (
              <PaymentMethodRow
                key={pm.id}
                pm={pm}
                onSetDefault={() =>
                  setDefaultPaymentMethod(pm.id)
                    .then(() =>
                      showToast("Método marcado como default", "success"),
                    )
                    .catch((e) => showToast(e.message, "error"))
                }
                onRemove={() => {
                  if (
                    confirm(
                      `¿Eliminar método ${pm.brand?.toUpperCase() ?? pm.type} ${pm.last4 ?? ""}?`,
                    )
                  ) {
                    removePaymentMethod(pm.id)
                      .then(() => showToast("Método eliminado", "success"))
                      .catch((e) => showToast(e.message, "error"));
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
          <p className="text-sm text-slate-400 italic py-4">
            Sin facturas aún.
          </p>
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
                    showToast("Factura pagada (mock)", "success");
                  } catch (e: any) {
                    showToast(e.message ?? "Error al pagar", "error");
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
        title={confirmPlan ? `Confirmar plan: ${confirmPlan.name}` : ""}
      >
        {confirmPlan && (
          <ConfirmPlanSubscribe
            plan={confirmPlan}
            paymentMethods={paymentMethods}
            onConfirm={async (paymentMethodId) => {
              try {
                await subscribe(confirmPlan.id, paymentMethodId);
                showToast(`¡Plan ${confirmPlan.name} activado!`, "success");
                setConfirmPlan(null);
              } catch (e: any) {
                showToast(e.message ?? "Error al subscribirse", "error");
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
              showToast("Método de pago agregado", "success");
              setAddPmOpen(false);
            } catch (e: any) {
              showToast(e.message ?? "Error al agregar método", "error");
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
            ¿Estás seguro? Tu subscripción se cancelará al final del periodo
            actual (
            {sub
              ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")
              : "—"}
            ), pero seguirá activa hasta entonces. Podés reactivarla antes de
            esa fecha.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              No, mantener
            </Button>
            <Button
              onClick={async () => {
                try {
                  await cancelSubscription();
                  showToast(
                    "Subscripción se cancelará al final del periodo",
                    "success",
                  );
                  setConfirmCancel(false);
                } catch (e: any) {
                  showToast(e.message ?? "Error al cancelar", "error");
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
