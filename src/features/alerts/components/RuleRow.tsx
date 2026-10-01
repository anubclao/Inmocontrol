// filepath: src/features/alerts/components/RuleRow.tsx
/**
 * RuleRow — fila de regla con toggle enabled, canales, audiencias y offset (días).
 * Sale de AlertsView.tsx como parte del refactor #11.
 */
import { Input, cn } from "../../../shared/ui";
import {
  AUDIENCE_LABEL,
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  type AlertRule,
  type Audience,
  type ChannelType,
} from "../ruleTypes";
import { CHANNEL_ICON } from "./constants";

const CHANNELS: ChannelType[] = ["whatsapp", "email", "in_app"];
const AUDIENCES: Audience[] = ["tenant", "owner", "agent"];

export interface RuleRowProps {
  rule: AlertRule;
  onToggleEnabled: () => void;
  onToggleChannel: (c: ChannelType) => void;
  onToggleAudience: (a: Audience) => void;
  onSetOffset: (n: number) => void;
}

export function RuleRow({
  rule,
  onToggleEnabled,
  onToggleChannel,
  onToggleAudience,
  onSetOffset,
}: RuleRowProps) {
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
            {CHANNELS.map((c) => {
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
            {AUDIENCES.map((a) => {
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
