// filepath: src/features/alerts/components/EmailChannelSummary.tsx
/**
 * EmailChannelSummary — mini-resumen de buzones para mostrar dentro del modal
 * "Configurar Canales" cuando el canal es email. Lista los primeros 4 buzones
 * activos con su purpose y marca el default.
 *
 * Sale de AlertsView.tsx como parte del refactor #11.
 */
import { useNotificationConfigStore } from "../notificationConfigStore";

export function EmailChannelSummary() {
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
    <ul className="space-y-0.5">
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
