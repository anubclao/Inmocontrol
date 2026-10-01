// filepath: src/features/saasBilling/components/CurrentPlanBanner.tsx
/**
 * CurrentPlanBanner — banner con el plan actual del cliente.
 * Sale de SaasBillingView.tsx como parte del refactor #16.
 */
import { Calendar, Check, Crown, X } from "lucide-react";
import { Button, Card, cn } from "../../../shared/ui";
import { formatCop, type Plan } from "../types";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Activa", cls: "bg-emerald-100 text-emerald-700" },
  trialing: { label: "En trial", cls: "bg-sky-100 text-sky-700" },
  past_due: { label: "Pago pendiente", cls: "bg-amber-100 text-amber-700" },
  canceled: { label: "Cancelada", cls: "bg-slate-200 text-slate-600" },
  unpaid: { label: "Impaga", cls: "bg-red-100 text-red-700" },
};

export interface CurrentPlanBannerProps {
  plan: Plan | null;
  subscription: {
    planId: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  loading: boolean;
  onCancel: () => void;
  onReactivate: () => void;
}

export function CurrentPlanBanner({
  plan,
  subscription,
  loading,
  onCancel,
  onReactivate,
}: CurrentPlanBannerProps) {
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
            <h3 className="font-bold text-slate-900">
              Sin subscripción activa
            </h3>
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
              <h3 className="font-bold text-xl text-slate-900">
                Plan {plan.name}
              </h3>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                  statusBadge.cls,
                )}
              >
                {statusBadge.label}
              </span>
              {subscription.cancelAtPeriodEnd && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Se cancelará
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {formatCop(plan.priceCop)}/mes · {plan.maxProperties} inmuebles ·{" "}
              {plan.maxUsers} usuarios ·{" "}
              {plan.maxAlertsPerMonth.toLocaleString("es-CO")} alertas/mes
            </p>
            <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {subscription.cancelAtPeriodEnd
                ? `Termina el ${new Date(subscription.currentPeriodEnd).toLocaleDateString("es-CO")}`
                : `Próxima renovación: ${new Date(subscription.currentPeriodEnd).toLocaleDateString("es-CO")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {subscription.cancelAtPeriodEnd ? (
            <Button variant="outline" onClick={onReactivate} className="gap-1">
              <Check className="w-3.5 h-3.5" /> Reactivar
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={onCancel}
              className="gap-1 text-red-600 border-red-100 hover:bg-red-50"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
