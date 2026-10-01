// filepath: src/features/settings/integrations/EmailIntegrationsCard.tsx
// Card resumen de la integración de Email en el listado de Integraciones.
//
// Muestra cuántos buzones están activos y un botón "Configurar" que abre
// el modal de configuración de email (manejado por el padre).
//
// fix-issue-09 (commit 1/2, oct-2026): extraído del monolito SettingsView.tsx
// (1033 → <300 lineas). Antes vivia inline en SettingsView.tsx (lineas 678-706).

import { Button } from "../../../shared/ui";
import { useNotificationConfigStore } from "../../alerts/notificationConfigStore";

export function EmailIntegrationsCard({
  onConfigure,
}: {
  onConfigure: () => void;
}) {
  const mailboxes = useNotificationConfigStore((s) => s.emailConfig.mailboxes);
  const enabled = mailboxes.filter((m) => m.enabled);
  const hasAny = enabled.length > 0;
  return (
    <div className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-xl shadow-sm">
          📧
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900">
            Email — Buzones por propósito
          </h4>
          <p className="text-xs text-slate-500">
            {hasAny
              ? `${enabled.length} buzón(es) activo(s) · cobros, contratos, alertas…`
              : "Configura buzones SMTP o SendGrid por propósito para enviar alertas."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded-full ${
            hasAny
              ? "bg-emerald-100 text-emerald-600"
              : "bg-amber-100 text-amber-600"
          }`}
        >
          {hasAny
            ? `${enabled.length} ACTIVO${enabled.length > 1 ? "S" : ""}`
            : "SIN CONFIGURAR"}
        </span>
        <Button variant="outline" size="sm" onClick={onConfigure}>
          Configurar
        </Button>
      </div>
    </div>
  );
}
