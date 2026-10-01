// filepath: src/features/alerts/components/LogRow.tsx
/**
 * LogRow — fila del historial de notificaciones.
 * Sale de AlertsView.tsx como parte del refactor #11.
 */
import { cn } from "../../../shared/ui";
import { AUDIENCE_LABEL, CHANNEL_LABEL } from "../ruleTypes";
import type { NotificationEntry } from "../notificationLogStore";
import { CHANNEL_COLOR, CHANNEL_ICON } from "./constants";

export interface LogRowProps {
  entry: NotificationEntry;
}

export function LogRow({ entry }: LogRowProps) {
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
