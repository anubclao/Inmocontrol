// filepath: src/features/alerts/components/AlertList.tsx
/**
 * AlertList — lista colapsable de alertas con preview del envío por canal/audiencia.
 * Sale de AlertsView.tsx como parte del refactor #11.
 */
import { motion, AnimatePresence } from "motion/react";
import { Bell, CheckCircle2, RefreshCw, Send, X } from "lucide-react";
import { Button, cn } from "../../../shared/ui";
import type { Alert } from "../types";
import { AUDIENCE_LABEL, CHANNEL_LABEL } from "../ruleTypes";
import { previewForAlert } from "../useNotificationEngine";
import {
  CATEGORY_ICON,
  CHANNEL_ICON,
  CHANNEL_COLOR,
  SEVERITY_BADGE,
} from "./constants";
import { ALERT_CATEGORY_LABEL } from "../types";

export interface AlertListProps {
  alerts: Alert[];
  allAlerts: Alert[];
  activeAlertId: string | null;
  onSetActive: (id: string | null) => void;
  onSendOne: (a: Alert) => void;
  onDismiss: (id: string) => void;
  onUndismiss: (id: string) => void;
  showDismissed: boolean;
  onClearDismissed: () => void;
}

export function AlertList({
  alerts,
  allAlerts,
  activeAlertId,
  onSetActive,
  onSendOne,
  onDismiss,
  showDismissed,
  onClearDismissed,
}: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="inline-flex p-3 bg-emerald-50 rounded-full mb-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
        </div>
        <h4 className="font-bold text-slate-900">Sin alertas activas</h4>
        <p className="text-sm text-slate-500 mt-1">
          No hay mora, vencimientos próximos ni documentos pendientes.
        </p>
        {allAlerts.length > 0 && (
          <p className="text-xs text-amber-600 mt-2">
            {allAlerts.length} alerta(s) descartada(s) — usa "Mostrar
            descartadas" para verlas.
          </p>
        )}
        {showDismissed && allAlerts.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={onClearDismissed}
            className="mt-3 gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Restaurar todas
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
      {alerts.map((alert) => {
        const Icon = CATEGORY_ICON[alert.category] ?? Bell;
        const badge = SEVERITY_BADGE[alert.severity];
        const isActive = activeAlertId === alert.id;
        const preview = previewForAlert(alert);
        return (
          <div key={alert.id} className="bg-white">
            <div
              className={cn(
                "flex items-start gap-3 p-4 transition-colors cursor-pointer",
                isActive ? "bg-blue-50/50" : "hover:bg-slate-50",
              )}
              onClick={() => onSetActive(isActive ? null : alert.id)}
            >
              <div
                className={cn(
                  "p-2 rounded-lg shrink-0",
                  alert.severity === "critical"
                    ? "bg-red-50"
                    : alert.severity === "warning"
                      ? "bg-amber-50"
                      : "bg-sky-50",
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4",
                    alert.severity === "critical"
                      ? "text-red-600"
                      : alert.severity === "warning"
                        ? "text-amber-600"
                        : "text-sky-600",
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-slate-900 truncate">
                    {alert.title}
                  </h4>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                      badge.cls,
                    )}
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
                {preview.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Se enviaría por {preview.length} vía(s):{" "}
                    {preview.map((p) => CHANNEL_LABEL[p.channel]).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendOne(alert);
                  }}
                  className="gap-1"
                  title="Enviar notificación ahora"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(alert.id);
                  }}
                  title="Descartar alerta"
                  className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-slate-100 bg-slate-50/50"
                >
                  <div className="p-4 space-y-2">
                    {preview.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">
                        Esta alerta no se enviará: la regla está desactivada, o
                        no hay canales/audiencias configurados.
                      </p>
                    ) : (
                      preview.map((p, i) => {
                        const ChIcon = CHANNEL_ICON[p.channel];
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-2 p-2 bg-white rounded-lg border border-slate-100"
                          >
                            <div
                              className={cn(
                                "p-1.5 rounded shrink-0",
                                CHANNEL_COLOR[p.channel],
                              )}
                            >
                              <ChIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-900">
                                  {CHANNEL_LABEL[p.channel]} →{" "}
                                  {AUDIENCE_LABEL[p.audience]}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  ({p.recipientHandle})
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-1 line-clamp-3">
                                {p.body}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
