import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell,
  Settings,
  Send,
  X,
  Clock,
  AlertTriangle,
  FileX,
  DollarSign,
  CheckCircle2,
  XCircle,
  Trash2,
  Inbox,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  Mail,
  Smartphone,
} from "lucide-react";
import { Button, Card, Modal, Input, cn } from "../../shared/ui";
import { selectVisibleAlerts, useAlertsStore } from "./alertsStore";
import {
  ALERT_CATEGORY_LABEL,
  type Alert,
  type AlertCategory,
  type AlertSeverity,
} from "./types";
import { useNotificationConfigStore } from "./notificationConfigStore";
import {
  useNotificationLogStore,
  type NotificationEntry,
} from "./notificationLogStore";
import {
  AUDIENCE_LABEL,
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  CONFIGURABLE_CATEGORIES,
  type AlertRule,
  type Audience,
  type ChannelType,
  type ConfigurableCategory,
} from "./ruleTypes";
import {
  sendForAlert,
  sendAll,
  previewForAlert,
} from "./useNotificationEngine";

export interface AlertsViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
}

const SEVERITY_BADGE: Record<AlertSeverity, { label: string; cls: string }> = {
  critical: { label: "Crítica", cls: "bg-red-100 text-red-700 border-red-200" },
  warning: {
    label: "Alerta",
    cls: "bg-amber-100 text-amber-700 border-amber-200",
  },
  info: { label: "Info", cls: "bg-sky-100 text-sky-700 border-sky-200" },
};

const CATEGORY_ICON: Record<AlertCategory, any> = {
  mora: DollarSign,
  vencimiento: Clock,
  preaviso: AlertTriangle,
  documento: FileX,
  pago: Bell,
};

const CHANNEL_ICON: Record<ChannelType, any> = {
  whatsapp: MessageSquare,
  email: Mail,
  in_app: Smartphone,
};

const CHANNEL_COLOR: Record<ChannelType, string> = {
  whatsapp: "text-emerald-600 bg-emerald-50",
  email: "text-blue-600 bg-blue-50",
  in_app: "text-violet-600 bg-violet-50",
};

export function AlertsView({ showToast }: AlertsViewProps) {
  // ── Stores ──
  const visibleAlerts = useAlertsStore(selectVisibleAlerts);
  const allAlerts = useAlertsStore((s) => s.alerts);
  const dismiss = useAlertsStore((s) => s.dismiss);
  const undismiss = useAlertsStore((s) => s.undismiss);
  const clearDismissed = useAlertsStore((s) => s.clearDismissed);
  const dismissedCount = useAlertsStore((s) => s.dismissed.length);

  const rules = useNotificationConfigStore((s) => s.rules);
  const channels = useNotificationConfigStore((s) => s.channels);
  const toggleRule = useNotificationConfigStore((s) => s.toggleRule);
  const toggleRuleChannel = useNotificationConfigStore(
    (s) => s.toggleRuleChannel,
  );
  const toggleRuleAudience = useNotificationConfigStore(
    (s) => s.toggleRuleAudience,
  );
  const updateRule = useNotificationConfigStore((s) => s.updateRule);

  const logEntries = useNotificationLogStore((s) => s.entries);
  const clearLog = useNotificationLogStore((s) => s.clear);

  // ── Local UI state ──
  const [channelsModalOpen, setChannelsModalOpen] = useState(false);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  // ── Derived ──
  const stats = useMemo(() => {
    const sentToday = logEntries.filter((e) => {
      const d = new Date(e.sentAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    const enabledChannels = channels.filter((c) => c.enabled).length;
    const enabledRules = rules.filter((r) => r.enabled).length;
    return {
      pending: visibleAlerts.length,
      sentToday,
      channels: enabledChannels,
      rules: enabledRules,
    };
  }, [visibleAlerts.length, logEntries, channels, rules]);

  const handleSendAll = () => {
    if (visibleAlerts.length === 0) {
      showToast("No hay alertas pendientes", "error");
      return;
    }
    const { sent, skipped } = sendAll(visibleAlerts);
    if (sent === 0) {
      showToast(
        "Todas las alertas fueron omitidas (sin destinatario o canal apagado)",
        "error",
      );
    } else {
      showToast(
        `Enviadas ${sent} notificación(es)${skipped ? `, ${skipped} omitida(s)` : ""}`,
        "success",
      );
    }
  };

  const handleSendOne = (alert: Alert) => {
    const n = sendForAlert(alert);
    if (n === 0) {
      showToast(
        "Sin destinatarios válidos o canales apagados para esta alerta",
        "error",
      );
    } else {
      showToast(`Enviada(s) ${n} notificación(es) para esta alerta`, "success");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Centro de Notificaciones Inteligentes
          </h2>
          <p className="text-slate-500 text-sm">
            Módulo integral — alertas automáticas, parametrizable por el
            usuario.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none gap-2"
            onClick={() => setHistoryOpen(true)}
          >
            <Bell className="w-4 h-4" />
            Historial
            {logEntries.length > 0 && (
              <span className="ml-1 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">
                {logEntries.length}
              </span>
            )}
          </Button>
          <Button
            className="flex-1 sm:flex-none gap-2"
            onClick={() => setChannelsModalOpen(true)}
          >
            <Settings className="w-4 h-4" />
            Configurar Canales
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pendientes"
          value={stats.pending}
          accent={stats.pending > 0 ? "amber" : "slate"}
          icon={Bell}
        />
        <StatCard
          label="Enviadas hoy"
          value={stats.sentToday}
          accent="emerald"
          icon={Send}
        />
        <StatCard
          label="Canales activos"
          value={`${stats.channels}/3`}
          accent="blue"
          icon={MessageSquare}
        />
        <StatCard
          label="Reglas activas"
          value={`${stats.rules}/${rules.length}`}
          accent="violet"
          icon={CheckCircle2}
        />
      </div>

      {/* ── Alertas pendientes ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div>
            <h3 className="font-bold text-slate-900">Alertas Pendientes</h3>
            <p className="text-xs text-slate-500">
              Detectadas en tiempo real desde contratos, facturas y propiedades.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {dismissedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDismissed((v) => !v)}
                className="gap-1 text-slate-500"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {showDismissed ? "Ocultar" : "Mostrar"} descartadas (
                {dismissedCount})
              </Button>
            )}
            <Button size="sm" onClick={handleSendAll} className="gap-1">
              <Send className="w-3.5 h-3.5" />
              Enviar todas
            </Button>
          </div>
        </div>

        <AlertList
          alerts={visibleAlerts}
          allAlerts={allAlerts}
          activeAlertId={activeAlertId}
          onSetActive={setActiveAlertId}
          onSendOne={handleSendOne}
          onDismiss={(id) => {
            dismiss(id);
            showToast("Alerta descartada");
          }}
          onUndismiss={(id) => {
            undismiss(id);
            showToast("Alerta restaurada");
          }}
          showDismissed={showDismissed}
          onClearDismissed={() => {
            clearDismissed();
            showToast("Alertas restauradas");
          }}
        />
      </Card>

      {/* ── Reglas por categoría ── */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900">Reglas por Categoría</h3>
          <p className="text-xs text-slate-500">
            Activa o desactiva cada categoría, y elige por qué canal y a quién
            notificar.
          </p>
        </div>
        <div className="space-y-3">
          {CONFIGURABLE_CATEGORIES.map((cat) => {
            const rule = rules.find((r) => r.category === cat);
            if (!rule) return null;
            return (
              <RuleRow
                key={cat}
                rule={rule}
                onToggleEnabled={() => toggleRule(cat)}
                onToggleChannel={(ch) => toggleRuleChannel(cat, ch)}
                onToggleAudience={(a) => toggleRuleAudience(cat, a)}
                onSetOffset={(n) => updateRule(cat, { offsetDays: n })}
              />
            );
          })}
        </div>
      </Card>

      {/* ── Modal: Configurar Canales ── */}
      <Modal
        isOpen={channelsModalOpen}
        onClose={() => setChannelsModalOpen(false)}
        title="Configurar Canales"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Activa o desactiva los canales de envío. Si un canal está apagado,
            ninguna regla lo usa.
          </p>
          {channels.map((ch) => (
            <ChannelConfigRow
              key={ch.type}
              config={ch}
              onToggleEnabled={() =>
                useNotificationConfigStore
                  .getState()
                  .setChannelEnabled(ch.type, !ch.enabled)
              }
              onToggleConnected={() =>
                useNotificationConfigStore
                  .getState()
                  .setChannelConnected(ch.type, !ch.connected)
              }
              onChangeIdentifier={(v) =>
                useNotificationConfigStore
                  .getState()
                  .setChannelIdentifier(ch.type, v)
              }
              onTest={() => {
                if (!ch.enabled) {
                  showToast("Activa el canal antes de probar", "error");
                  return;
                }
                showToast(
                  `📤 ${CHANNEL_LABEL[ch.type]} → prueba OK (${ch.identifier ?? "sin identificador"})`,
                  "success",
                );
              }}
            />
          ))}
        </div>
      </Modal>

      {/* ── Modal: Historial ── */}
      <Modal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`Historial de Notificaciones (${logEntries.length})`}
        size="lg"
      >
        {logEntries.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Inbox className="w-10 h-10 mx-auto mb-2" />
            <p>
              Sin notificaciones aún. Usa "Enviar todas" o "Enviar" en una
              alerta.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearLog();
                  showToast("Historial limpiado");
                }}
                className="text-red-500 gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar historial
              </Button>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
              {logEntries.map((e) => (
                <LogRow key={e.id} entry={e} />
              ))}
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  accent: "amber" | "slate" | "emerald" | "blue" | "violet";
  icon: any;
}) {
  const accentCls: Record<typeof accent, string> = {
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("p-1.5 rounded-lg", accentCls[accent])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
    </Card>
  );
}

function AlertList({
  alerts,
  allAlerts,
  activeAlertId,
  onSetActive,
  onSendOne,
  onDismiss,
  onUndismiss,
  showDismissed,
  onClearDismissed,
}: {
  alerts: Alert[];
  allAlerts: Alert[];
  activeAlertId: string | null;
  onSetActive: (id: string | null) => void;
  onSendOne: (a: Alert) => void;
  onDismiss: (id: string) => void;
  onUndismiss: (id: string) => void;
  showDismissed: boolean;
  onClearDismissed: () => void;
}) {
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

function RuleRow({
  rule,
  onToggleEnabled,
  onToggleChannel,
  onToggleAudience,
  onSetOffset,
}: {
  rule: AlertRule;
  onToggleEnabled: () => void;
  onToggleChannel: (c: ChannelType) => void;
  onToggleAudience: (a: Audience) => void;
  onSetOffset: (n: number) => void;
  key?: string;
}) {
  const channels: ChannelType[] = ["whatsapp", "email", "in_app"];
  const audiences: Audience[] = ["tenant", "owner", "agent"];
  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-colors",
        rule.enabled
          ? "bg-white border-slate-200"
          : "bg-slate-50 border-slate-100",
      )}
    >
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-900">
            {CATEGORY_LABEL[rule.category]}
          </span>
          {rule.notes && (
            <span className="text-xs text-slate-400">— {rule.notes}</span>
          )}
        </div>
        <button
          onClick={onToggleEnabled}
          className={cn(
            "w-9 h-5 rounded-full relative transition-colors shrink-0",
            rule.enabled ? "bg-blue-600" : "bg-slate-300",
          )}
          title={rule.enabled ? "Desactivar regla" : "Activar regla"}
        >
          <div
            className={cn(
              "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
              rule.enabled ? "right-0.5" : "left-0.5",
            )}
          />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Canales */}
        <div>
          <p className="font-bold text-slate-500 uppercase mb-1.5 text-[10px]">
            Canales
          </p>
          <div className="flex flex-wrap gap-1">
            {channels.map((c) => {
              const on = rule.channels.includes(c);
              const Icon = CHANNEL_ICON[c];
              return (
                <button
                  key={c}
                  onClick={() => onToggleChannel(c)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors",
                    on
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-white border-slate-200 text-slate-500",
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {CHANNEL_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>
        {/* Audiencias */}
        <div>
          <p className="font-bold text-slate-500 uppercase mb-1.5 text-[10px]">
            Audiencias
          </p>
          <div className="flex flex-wrap gap-1">
            {audiences.map((a) => {
              const on = rule.audiences.includes(a);
              return (
                <button
                  key={a}
                  onClick={() => onToggleAudience(a)}
                  className={cn(
                    "px-2 py-1 rounded-md border text-[11px] font-medium transition-colors",
                    on
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-white border-slate-200 text-slate-500",
                  )}
                >
                  {AUDIENCE_LABEL[a]}
                </button>
              );
            })}
          </div>
        </div>
        {/* Offset */}
        <div>
          <p className="font-bold text-slate-500 uppercase mb-1.5 text-[10px]">
            Offset (días
            {rule.category === "mora"
              ? " después"
              : rule.category === "vencimiento" || rule.category === "preaviso"
                ? " antes"
                : ""}
            )
          </p>
          <Input
            type="number"
            value={rule.offsetDays}
            onChange={(e) =>
              onSetOffset(Math.max(0, parseInt(e.target.value, 10) || 0))
            }
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

function ChannelConfigRow({
  config,
  onToggleEnabled,
  onToggleConnected,
  onChangeIdentifier,
  onTest,
}: {
  config: {
    type: ChannelType;
    enabled: boolean;
    connected: boolean;
    identifier?: string;
  };
  onToggleEnabled: () => void;
  onToggleConnected: () => void;
  onChangeIdentifier: (v: string) => void;
  onTest: () => void;
  key?: string;
}) {
  const Icon = CHANNEL_ICON[config.type];
  return (
    <div
      className={cn(
        "p-4 rounded-xl border",
        config.enabled
          ? "bg-white border-slate-200"
          : "bg-slate-50 border-slate-100",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div
            className={cn(
              "p-2 rounded-lg shrink-0",
              CHANNEL_COLOR[config.type],
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-slate-900">
                {CHANNEL_LABEL[config.type]}
              </h4>
              {config.enabled ? (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Activo
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 inline-flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Inactivo
                </span>
              )}
              <span
                className={cn(
                  "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full inline-flex items-center gap-1",
                  config.connected
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {config.connected ? "Conectado" : "Desconectado"}
              </span>
            </div>
            <div className="mt-2 max-w-md">
              {config.type === "email" ? (
                <div className="text-xs">
                  <p className="font-bold text-slate-500 uppercase mb-1 text-[10px]">
                    Buzones
                  </p>
                  <EmailChannelSummary />
                </div>
              ) : (
                <Input
                  label="Identificador"
                  value={config.identifier ?? ""}
                  onChange={(e) => onChangeIdentifier(e.target.value)}
                  placeholder={
                    config.type === "whatsapp"
                      ? "+57 300 123 4567"
                      : "Identificador interno"
                  }
                  className="text-xs"
                />
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold">
              Conectado
            </span>
            <button
              onClick={onToggleConnected}
              className={cn(
                "w-8 h-4 rounded-full relative transition-colors",
                config.connected ? "bg-blue-600" : "bg-slate-300",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                  config.connected ? "right-0.5" : "left-0.5",
                )}
              />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold">
              Activo
            </span>
            <button
              onClick={onToggleEnabled}
              className={cn(
                "w-8 h-4 rounded-full relative transition-colors",
                config.enabled ? "bg-emerald-600" : "bg-slate-300",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                  config.enabled ? "right-0.5" : "left-0.5",
                )}
              />
            </button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            className="gap-1 mt-1"
          >
            <Send className="w-3 h-3" />
            Probar
          </Button>
        </div>
      </div>
    </div>
  );
}
function LogRow({ entry }: { entry: NotificationEntry; key?: string }) {
  const Icon = CHANNEL_ICON[entry.channel];
  const time = new Date(entry.sentAt);
  return (
    <div className="flex items-start gap-3 p-3 hover:bg-slate-50">
      <div
        className={cn(
          "p-1.5 rounded-lg shrink-0",
          CHANNEL_COLOR[entry.channel],
        )}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-900">
            {entry.subject}
          </span>
          <span className="text-[10px] text-slate-400 uppercase">
            {CHANNEL_LABEL[entry.channel]} → {AUDIENCE_LABEL[entry.audience]}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Para {entry.recipientName} ({entry.recipientHandle})
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {time.toLocaleString("es-CO")}
        </p>
      </div>
    </div>
  );
}

/** Mini-resumen de buzones para mostrar dentro del modal "Configurar Canales". */
function EmailChannelSummary() {
  const mailboxes = useNotificationConfigStore((s) => s.emailConfig.mailboxes);
  const defaultId = useNotificationConfigStore(
    (s) => s.emailConfig.defaultMailboxId,
  );
  const enabled = mailboxes.filter((m) => m.enabled);
  if (enabled.length === 0) {
    return (
      <p className="text-slate-400 italic">
        Sin buzones. Configúralos en{" "}
        <strong>Settings → Integraciones → Email</strong>.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {enabled.slice(0, 4).map((m) => (
        <li key={m.id} className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-slate-700">{m.fromEmail}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            · {m.purpose}
          </span>
          {m.id === defaultId && (
            <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-blue-100 text-blue-700">
              Default
            </span>
          )}
        </li>
      ))}
      {enabled.length > 4 && (
        <li className="text-[11px] text-slate-400">
          + {enabled.length - 4} más…
        </li>
      )}
    </ul>
  );
}
