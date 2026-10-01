// filepath: src/features/alerts/components/ChannelConfigRow.tsx
/**
 * ChannelConfigRow — fila de configuración de canal (email/whatsapp/in_app) en el
 * modal "Configurar Canales". Toggle enabled/connected, identifier y test.
 * Sale de AlertsView.tsx como parte del refactor #11.
 */
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { Button, Input, cn } from "../../../shared/ui";
import { CHANNEL_LABEL, type ChannelType } from "../ruleTypes";
import { CHANNEL_COLOR, CHANNEL_ICON } from "./constants";
import { EmailChannelSummary } from "./EmailChannelSummary";

export interface ChannelConfigRowProps {
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
}

export function ChannelConfigRow({
  config,
  onToggleEnabled,
  onToggleConnected,
  onChangeIdentifier,
  onTest,
}: ChannelConfigRowProps) {
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
