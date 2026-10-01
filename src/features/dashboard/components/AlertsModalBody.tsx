// filepath: src/features/dashboard/components/AlertsModalBody.tsx
import {
  Bell,
  ClipboardCheck,
  Inbox,
  X,
  ExternalLink,
  DollarSign,
  Clock,
  AlertTriangle,
  FileX,
} from "lucide-react";
import { Button } from "../../../shared/ui";
import { useAlertsStore } from "../../alerts/alertsStore";
import {
  ALERT_CATEGORY_LABEL,
  type Alert,
  type AlertCategory,
  type AlertSeverity,
} from "../../alerts/types";

/** Icono por categoría de alerta. Usado solo por AlertsModalBody. */
const CATEGORY_ICON: Record<AlertCategory, typeof Bell> = {
  mora: DollarSign,
  vencimiento: Clock,
  preaviso: AlertTriangle,
  documento: FileX,
  pago: Bell,
};

/** Badge de severidad (color + label corto). */
const SEVERITY_BADGE: Record<AlertSeverity, { label: string; cls: string }> = {
  critical: { label: "Crítica", cls: "bg-red-100 text-red-700 border-red-200" },
  warning: {
    label: "Alerta",
    cls: "bg-amber-100 text-amber-700 border-amber-200",
  },
  info: { label: "Info", cls: "bg-sky-100 text-sky-700 border-sky-200" },
};

export interface AlertsModalBodyProps {
  visibleAlerts: Alert[];
  allCount: number;
  onDismiss: (id: string) => void;
  onClearDismissed: () => void;
  onNavigateToAlerts: () => void;
}

/**
 * Cuerpo del modal "Alertas Pendientes" que se abre desde el card del
 * Dashboard. Muestra lista filtrable con drill-down a la vista completa de
 * Alertas. Tres estados: sin alertas, todas descartadas, lista activa.
 */
export function AlertsModalBody({
  visibleAlerts,
  allCount,
  onDismiss,
  onClearDismissed,
  onNavigateToAlerts,
}: AlertsModalBodyProps) {
  const dismissedCount = useAlertsStore((s) => s.dismissed.length);

  if (allCount === 0) {
    return (
      <div className="py-12 text-center">
        <div className="inline-flex p-4 bg-emerald-50 rounded-full mb-4">
          <ClipboardCheck className="w-8 h-8 text-emerald-600" />
        </div>
        <h4 className="font-bold text-slate-900 text-lg">
          Sin alertas activas
        </h4>
        <p className="text-sm text-slate-500 mt-1">
          No hay mora, vencimientos próximos ni documentos pendientes. El
          sistema seguirá monitoreando y te avisará cuando algo cambie.
        </p>
        <p className="text-xs text-slate-400 mt-4">
          Las alertas se derivan en tiempo real de contratos, facturas y
          propiedades.
        </p>
      </div>
    );
  }

  if (visibleAlerts.length === 0) {
    return (
      <div className="py-10 text-center space-y-3">
        <div className="inline-flex p-4 bg-slate-100 rounded-full">
          <Inbox className="w-8 h-8 text-slate-400" />
        </div>
        <h4 className="font-bold text-slate-900">Todo descartado</h4>
        <p className="text-sm text-slate-500">
          Hay {allCount} alerta(s) pero todas están marcadas como descartadas.
        </p>
        <Button variant="outline" onClick={onClearDismissed}>
          Restaurar todas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Mostrando {visibleAlerts.length} de {allCount} alerta(s) activa(s)
          {dismissedCount > 0 && ` · ${dismissedCount} descartada(s)`}
        </span>
        <button
          type="button"
          onClick={onNavigateToAlerts}
          className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
        >
          Ver todas en Alertas <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
        {visibleAlerts.map((alert) => {
          const Icon = CATEGORY_ICON[alert.category] ?? Bell;
          const badge = SEVERITY_BADGE[alert.severity];
          return (
            <div
              key={alert.id}
              className="flex items-start gap-3 p-4 bg-white hover:bg-slate-50 transition-colors"
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  alert.severity === "critical"
                    ? "bg-red-50"
                    : alert.severity === "warning"
                      ? "bg-amber-50"
                      : "bg-sky-50"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    alert.severity === "critical"
                      ? "text-red-600"
                      : alert.severity === "warning"
                        ? "text-amber-600"
                        : "text-sky-600"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-slate-900 truncate">
                    {alert.title}
                  </h4>
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase">
                    {ALERT_CATEGORY_LABEL[alert.category]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {alert.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(alert.id)}
                title="Descartar alerta"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-2">
        <p className="text-xs text-slate-400">
          Las alertas se recalculan automáticamente al cambiar contratos o
          facturas.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateToAlerts}
          className="gap-1"
        >
          Ir a Alertas <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
