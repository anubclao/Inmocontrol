// filepath: src/features/settings/integrations/EmailConfigManager.tsx
// Pantalla principal de email dentro del modal de configuraciÃ³n.
//
// Muestra el estado del backend (nodemailer + fallback), la lista de buzones
// configurados con sus acciones (activar/desactivar, default, editar, eliminar)
// y delega el form de crear/editar a `EmailMailboxForm`.
//
// fix-issue-09 (commit 2/2, oct-2026): extraido del monolito SettingsView.tsx
// (870 â†’ <300 lineas). Antes vivia inline en SettingsView.tsx lineas 833-1089.

import { useEffect, useState } from "react";
import { Button } from "../../../shared/ui";
import { useNotificationConfigStore } from "../../alerts/notificationConfigStore";
import { Plus, Mail, Trash2 } from "lucide-react";
import { EmailMailboxForm } from "./EmailMailboxForm";

export function EmailConfigManager({
  showToast,
}: {
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const mailboxes = useNotificationConfigStore((s) => s.emailConfig.mailboxes);
  const defaultId = useNotificationConfigStore(
    (s) => s.emailConfig.defaultMailboxId,
  );
  const addMailbox = useNotificationConfigStore((s) => s.addMailbox);
  const updateMailbox = useNotificationConfigStore((s) => s.updateMailbox);
  const removeMailbox = useNotificationConfigStore((s) => s.removeMailbox);
  const toggleMailbox = useNotificationConfigStore((s) => s.toggleMailbox);
  const setDefaultMailbox = useNotificationConfigStore(
    (s) => s.setDefaultMailbox,
  );

  const [status, setStatus] = useState<{
    packageInstalled: boolean;
    fallbackConfigured: boolean;
    fallbackProvider: string | null;
    message: string;
  } | null>(null);
  const [editing, setEditing] = useState<null | {
    mode: "create" | "edit";
    mailboxId?: string;
  }>(null);

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/notifications/email/status");
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setStatus({
        packageInstalled: false,
        fallbackConfigured: false,
        fallbackProvider: null,
        message: `No se pudo conectar al server: ${err?.message ?? "error"}`,
      });
    }
  };
  useEffect(() => {
    checkStatus();
  }, []);

  // â”€â”€ Vista: lista de buzones â”€â”€
  if (!editing) {
    return (
      <div className="space-y-4">
        {/* Estado del paquete + fallback */}
        <div
          className={`p-4 rounded-xl border ${
            !status
              ? "bg-slate-50 border-slate-200"
              : status.packageInstalled
                ? "bg-emerald-50 border-emerald-200"
                : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-sm text-slate-900">
                  Backend de email
                </h4>
                {status?.packageInstalled ? (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    Nodemailer OK
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Sin nodemailer
                  </span>
                )}
                {status?.fallbackConfigured && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    Fallback {status.fallbackProvider}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                {status?.message ?? "Cargandoâ€¦"}
              </p>
            </div>
            <button
              onClick={checkStatus}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Reverificar
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm text-slate-900">
              Buzones configurados ({mailboxes.length})
            </h4>
            <Button
              size="sm"
              onClick={() => setEditing({ mode: "create" })}
              className="gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar buzÃ³n
            </Button>
          </div>
          {mailboxes.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 border border-slate-100 rounded-xl">
              <Mail className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                Sin buzones aÃºn
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Agrega al menos uno por cada propÃ³sito (cobros, contratos,
                alertas) o un "general" como fallback.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {mailboxes.map((m) => (
                <li
                  key={m.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {m.fromEmail}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                          {m.purpose}
                        </span>
                        {m.id === defaultId && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                            Default
                          </span>
                        )}
                        {!m.enabled && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {m.fromName} Â·{" "}
                        {m.provider.kind === "sendgrid"
                          ? "SendGrid"
                          : `SMTP ${m.provider.host}:${m.provider.port}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleMailbox(m.id)}
                        className={`w-8 h-4 rounded-full relative transition-colors ${m.enabled ? "bg-emerald-600" : "bg-slate-300"}`}
                        title={m.enabled ? "Desactivar" : "Activar"}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${m.enabled ? "right-0.5" : "left-0.5"}`}
                        />
                      </button>
                      {m.id !== defaultId && m.enabled && (
                        <button
                          onClick={() => setDefaultMailbox(m.id)}
                          className="text-[10px] text-blue-600 hover:text-blue-700 font-medium px-2"
                          title="Marcar como default"
                        >
                          Hacer default
                        </button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditing({ mode: "edit", mailboxId: m.id })
                        }
                        className="text-slate-500 hover:text-blue-600 px-2"
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Â¿Eliminar buzÃ³n ${m.fromEmail}?`)) {
                            removeMailbox(m.id);
                            showToast("BuzÃ³n eliminado", "success");
                          }
                        }}
                        className="text-slate-400 hover:text-red-600 px-2"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-900">
            CÃ³mo funciona el routing
          </p>
          <p>
            El motor elige automÃ¡ticamente el buzÃ³n segÃºn el propÃ³sito de la
            alerta:
          </p>
          <ul className="list-disc list-inside ml-2 space-y-0.5 text-slate-600">
            <li>
              <strong>mora</strong> â†’ cobros
            </li>
            <li>
              <strong>vencimiento / preaviso</strong> â†’ contratos
            </li>
            <li>
              <strong>documento</strong> â†’ alertas
            </li>
            <li>
              Si no hay match â†’ buzÃ³n <strong>default</strong>.
            </li>
          </ul>
        </div>

        <p className="text-[11px] text-slate-400">
          Las credenciales SMTP/SendGrid se guardan en el navegador
          (localStorage cifrado a nivel app). En producciÃ³n SaaS se moverÃ¡n al
          backend cifrado â€” el frontend solo conocerÃ¡ IDs de buzÃ³n.
        </p>
      </div>
    );
  }

  // â”€â”€ Vista: crear/editar buzÃ³n â”€â”€
  return (
    <EmailMailboxForm
      mode={editing.mode}
      mailboxId={editing.mailboxId}
      showToast={showToast}
      onCancel={() => setEditing(null)}
      onSaved={() => {
        setEditing(null);
        showToast(
          editing.mode === "create" ? "BuzÃ³n creado" : "BuzÃ³n actualizado",
          "success",
        );
      }}
    />
  );
}

