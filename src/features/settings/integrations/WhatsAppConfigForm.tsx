// filepath: src/features/settings/integrations/WhatsAppConfigForm.tsx
// Form de configuración del canal WhatsApp (vía Twilio).
//
// Estado real del canal (configurado / no), test send al número que el
// usuario indique. El "API Key" NUNCA vive en el cliente — está en
// `process.env` del server (variables TWILIO_*).
//
// fix-issue-09 (commit 1/2, oct-2026): extraído del monolito SettingsView.tsx
// (1033 → <300 lineas). Antes vivia inline en SettingsView.tsx (lineas 534-673).
// Migrado de `fetch` directo a `apiRequest` (limpieza de bonus).

import { useEffect, useState } from "react";
import { Button, Input } from "../../../shared/ui";
import {
  apiRequest,
  ApiError,
  ApiTimeoutError,
} from "../../../shared/lib/apiClient";

type WhatsAppStatus = {
  configured: boolean;
  mode: "mock" | "live";
  from: string | null;
  message: string;
};

type TestSendResult = {
  to: string;
  sid?: string;
};

export function WhatsAppConfigForm({
  showToast,
}: {
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [sending, setSending] = useState(false);

  const checkStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await apiRequest<WhatsAppStatus>(
        "GET",
        "/api/notifications/whatsapp/status",
      );
      setStatus(data);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError || err instanceof ApiTimeoutError
          ? err.message
          : ((err as Error)?.message ?? "error");
      setStatus({
        configured: false,
        mode: "mock",
        from: null,
        message: `No se pudo conectar al server: ${msg}`,
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  // Check status al montar
  useEffect(() => {
    void checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendTest = async () => {
    if (!testNumber.trim()) {
      showToast("Ingresa un número de WhatsApp para probar", "error");
      return;
    }
    setSending(true);
    try {
      const data = await apiRequest<TestSendResult>(
        "POST",
        "/api/notifications/whatsapp/test",
        { to: testNumber.trim() },
      );
      showToast(
        `✅ Mensaje enviado a ${data.to} (SID: ${data.sid?.slice(0, 10)}…)`,
        "success",
      );
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? `Error: ${err.message}`
          : err instanceof ApiTimeoutError
            ? "Timeout al conectar con el server"
            : `Error de red: ${(err as Error)?.message ?? "desconocido"}`;
      showToast(msg, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Estado del canal ── */}
      <div
        className={`p-4 rounded-xl border ${
          !status
            ? "bg-slate-50 border-slate-200"
            : status.configured
              ? "bg-emerald-50 border-emerald-200"
              : "bg-amber-50 border-amber-200"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm text-slate-900">
                Estado del canal
              </h4>
              {loadingStatus ? (
                <span className="text-xs text-slate-500">Verificando…</span>
              ) : status?.configured ? (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Conectado (live)
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Mock (no configurado)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              {status?.message ?? "Cargando estado…"}
            </p>
            {status?.from && (
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-mono">{status.from}</span>
                {status.mode === "live" && (
                  <span className="text-slate-400">
                    {" "}
                    (server-side, no editable desde acá)
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={checkStatus}
            disabled={loadingStatus}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0"
          >
            {loadingStatus ? "…" : "Reverificar"}
          </button>
        </div>
      </div>

      {/* ── Setup guide (solo si no está configurado) ── */}
      {status && !status.configured && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-slate-700 space-y-2">
          <p className="font-semibold text-slate-900">Cómo configurarlo:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600">
            <li>
              Crear cuenta gratis en{" "}
              <a
                href="https://console.twilio.com"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                console.twilio.com
              </a>
            </li>
            <li>
              Console → <strong>Messaging → Try it out → WhatsApp</strong> →
              copiar el sandbox number
            </li>
            <li>
              Console → <strong>Account → API keys &amp; tokens</strong> →
              copiar <code className="bg-white px-1 rounded">Account SID</code>{" "}
              y <code className="bg-white px-1 rounded">Auth Token</code>
            </li>
            <li>
              Agregar estas 3 variables a{" "}
              <code className="bg-white px-1 rounded">.env.local</code>:
              <pre className="mt-1 bg-white p-2 rounded border border-slate-200 text-[11px] overflow-x-auto">
                {`TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=tu_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`}
              </pre>
            </li>
            <li>
              Reiniciar el server (
              <code className="bg-white px-1 rounded">npm run dev:all</code>)
            </li>
            <li>
              Sandbox: el destinatario debe mandar{" "}
              <code className="bg-white px-1 rounded">
                join &lt;palabra&gt;
              </code>{" "}
              al sandbox number desde su WhatsApp antes de recibir el primer
              mensaje
            </li>
          </ol>
        </div>
      )}

      {/* ── Test send (solo si está configurado) ── */}
      {status?.configured && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
          <div>
            <h4 className="font-semibold text-sm text-slate-900">
              Probar envío
            </h4>
            <p className="text-xs text-slate-500">
              Mandá un mensaje de prueba a un número colombiano. Formato:{" "}
              <code className="bg-slate-100 px-1 rounded">
                +57 3XX XXX XXXX
              </code>
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="+57 300 123 4567"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="flex-1"
            />
            <Button onClick={sendTest} disabled={sending}>
              {sending ? "Enviando…" : "Enviar prueba"}
            </Button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        El token de Twilio NUNCA se guarda en el cliente. Vive solo en las
        variables de entorno del server. El sistema usa este canal para alertas
        automáticas según las reglas configuradas en{" "}
        <strong>Alertas → Reglas por Categoría</strong>.
      </p>
    </div>
  );
}
