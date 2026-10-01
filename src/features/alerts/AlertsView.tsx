import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Bell,
  Settings,
  Send,
  Trash2,
  Inbox,
  CheckCircle2,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { Button, Card, Modal, cn } from "../../shared/ui";
import { selectVisibleAlerts, useAlertsStore } from "./alertsStore";
import { type Alert } from "./types";
import { useNotificationConfigStore } from "./notificationConfigStore";
import {
  useNotificationLogStore,
} from "./notificationLogStore";
import {
  CHANNEL_LABEL,
  CONFIGURABLE_CATEGORIES,
} from "./ruleTypes";
import {
  sendForAlert,
  sendAll,
} from "./useNotificationEngine";
import { StatCard } from "./components/StatCard";
import { AlertList } from "./components/AlertList";
import { RuleRow } from "./components/RuleRow";
import { ChannelConfigRow } from "./components/ChannelConfigRow";
import { LogRow } from "./components/LogRow";

export interface AlertsViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
}

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
