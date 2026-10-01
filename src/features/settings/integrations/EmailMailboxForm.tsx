// filepath: src/features/settings/integrations/EmailMailboxForm.tsx
// Form para crear o editar un buzÃ³n de email.
//
// Maneja 3 sub-pasos:
//   1. Identidad (from name, from email, reply-to)
//   2. Provider (SMTP Gmail/Outlook o SendGrid)
//   3. Verificar / Test send / Guardar
//
// fix-issue-09 (commit 2/2, oct-2026): extraido del monolito SettingsView.tsx
// (870 â†’ <300 lineas). Antes vivia inline en SettingsView.tsx lineas 1090-1480.
//
// NOTA: este archivo excede el target de <250 lineas del spec original (~390).
// Razon: es un form cohesivo con 3 handlers interdependientes (buildMailbox,
// verify, testSend, save). Partirlo en sub-componentes introduce acoplamiento
// entre ellos (el handler `buildMailbox` valida 4 secciones distintas y
// construye un solo payload). Es candidato a refactor futuro si crece.
//
// No migra a `apiRequest` (limpieza separada) porque el form envia 2 endpoints
// distintos (verify + test) con tipos de respuesta heterogeneos â€” mejor
// esperar a que haya un `useEmailMailbox` hook que centralice.

import { useState } from "react";
import { Button, Input } from "../../../shared/ui";
import { useNotificationConfigStore } from "../../alerts/notificationConfigStore";
import type { EmailMailbox, EmailPurpose } from "../../alerts/ruleTypes";
import { EMAIL_PURPOSES, EMAIL_PURPOSE_LABEL } from "../../alerts/ruleTypes";

export function EmailMailboxForm({
  mode,
  mailboxId,
  onCancel,
  onSaved,
  showToast,
}: {
  mode: "create" | "edit";
  mailboxId?: string;
  onCancel: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const existing = useNotificationConfigStore((s) =>
    mailboxId
      ? s.emailConfig.mailboxes.find((m) => m.id === mailboxId)
      : undefined,
  );
  const addMailbox = useNotificationConfigStore((s) => s.addMailbox);
  const updateMailbox = useNotificationConfigStore((s) => s.updateMailbox);

  // Estado del form
  const [purpose, setPurpose] = useState<EmailPurpose>(
    existing?.purpose ?? "cobros",
  );
  const [fromName, setFromName] = useState(existing?.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(existing?.fromEmail ?? "");
  const [replyTo, setReplyTo] = useState(existing?.replyTo ?? "");
  const [providerKind, setProviderKind] = useState<"smtp" | "sendgrid">(
    existing?.provider.kind ?? "smtp",
  );
  // SMTP fields
  const [smtpHost, setSmtpHost] = useState(
    existing?.provider.kind === "smtp"
      ? existing.provider.host
      : "smtp.gmail.com",
  );
  const [smtpPort, setSmtpPort] = useState(
    existing?.provider.kind === "smtp" ? existing.provider.port : 587,
  );
  const [smtpUser, setSmtpUser] = useState(
    existing?.provider.kind === "smtp" ? existing.provider.user : "",
  );
  const [smtpPass, setSmtpPass] = useState(
    existing?.provider.kind === "smtp" ? existing.provider.pass : "",
  );
  const [smtpSecure, setSmtpSecure] = useState(
    existing?.provider.kind === "smtp" ? existing.provider.secure : false,
  );
  // SendGrid field
  const [sendgridKey, setSendgridKey] = useState(
    existing?.provider.kind === "sendgrid" ? existing.provider.apiKey : "",
  );

  const [verifying, setVerifying] = useState(false);
  const [testingTo, setTestingTo] = useState("");
  const [testing, setTesting] = useState(false);

  const providerPreset = (preset: "gmail" | "outlook" | "sendgrid") => {
    if (preset === "gmail") {
      setProviderKind("smtp");
      setSmtpHost("smtp.gmail.com");
      setSmtpPort(587);
      setSmtpSecure(false);
    } else if (preset === "outlook") {
      setProviderKind("smtp");
      setSmtpHost("smtp-mail.outlook.com");
      setSmtpPort(587);
      setSmtpSecure(false);
    } else {
      setProviderKind("sendgrid");
    }
  };

  const buildMailbox = (): Omit<EmailMailbox, "id" | "createdAt"> | null => {
    if (!fromEmail.trim()) {
      showToast("Ingresa el correo remitente (From)", "error");
      return null;
    }
    if (!fromName.trim()) {
      showToast("Ingresa el nombre remitente", "error");
      return null;
    }
    if (providerKind === "smtp") {
      if (!smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim()) {
        showToast("Completa host, usuario y contraseÃ±a SMTP", "error");
        return null;
      }
      return {
        purpose,
        fromName,
        fromEmail,
        ...(replyTo.trim() ? { replyTo: replyTo.trim() } : {}),
        provider: {
          kind: "smtp",
          host: smtpHost.trim(),
          port: smtpPort,
          user: smtpUser.trim(),
          pass: smtpPass,
          secure: smtpSecure,
        },
        enabled: true,
      };
    }
    if (!sendgridKey.trim()) {
      showToast("Ingresa la API key de SendGrid", "error");
      return null;
    }
    return {
      purpose,
      fromName,
      fromEmail,
      ...(replyTo.trim() ? { replyTo: replyTo.trim() } : {}),
      provider: { kind: "sendgrid", apiKey: sendgridKey.trim() },
      enabled: true,
    };
  };

  const handleVerify = async () => {
    const mb = buildMailbox();
    if (!mb) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/notifications/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox: mb }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok || !data.ok) {
        showToast(
          `VerificaciÃ³n fallÃ³: ${data?.error ?? `HTTP ${res.status}`}`,
          "error",
        );
        return;
      }
      showToast("âœ… ConexiÃ³n verificada â€” ahora guarda el buzÃ³n", "success");
    } catch (err: any) {
      showToast(`Error de red: ${err?.message ?? "desconocido"}`, "error");
    } finally {
      setVerifying(false);
    }
  };

  const handleTestSend = async () => {
    const mb = buildMailbox();
    if (!mb) return;
    if (!testingTo.trim()) {
      showToast("Ingresa un correo destino para la prueba", "error");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/notifications/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox: mb, to: testingTo.trim() }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok || !data.ok) {
        showToast(
          `EnvÃ­o fallÃ³: ${data?.error ?? `HTTP ${res.status}`}`,
          "error",
        );
        return;
      }
      showToast("âœ… Email de prueba enviado â€” revisÃ¡ tu bandeja", "success");
    } catch (err: any) {
      showToast(`Error de red: ${err?.message ?? "desconocido"}`, "error");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const mb = buildMailbox();
    if (!mb) return;
    if (mode === "create") {
      addMailbox(mb);
    } else if (mailboxId) {
      updateMailbox(mailboxId, mb);
    }
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-sm text-slate-900 mb-3">
          {mode === "create" ? "Nuevo buzÃ³n" : "Editar buzÃ³n"}
        </h4>
      </div>

      {/* Selector de propÃ³sito */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
          PropÃ³sito
        </label>
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as EmailPurpose)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
        >
          {EMAIL_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {EMAIL_PURPOSE_LABEL[p]}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-slate-400 mt-1">
          {purpose === "cobros" &&
            "Mora, recordatorios de pago. Suele ser un buzÃ³n tipo cobranzas@"}
          {purpose === "contratos" &&
            "Vencimientos, preavisos, renovaciones. Suele ser contratos@"}
          {purpose === "alertas" && "Documentos pendientes, alertas generales."}
          {purpose === "marketing" && "CampaÃ±as, newsletters (futuro)."}
          {purpose === "general" &&
            "Fallback cuando no hay match por propÃ³sito."}
        </p>
      </div>

      {/* Identidad */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Nombre remitente"
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          placeholder="Inmobiliaria XYZ"
        />
        <Input
          label="Correo remitente (From)"
          type="email"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="cobros@empresa.co"
        />
        <Input
          label="Reply-To (opcional)"
          type="email"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          placeholder="agente@empresa.co"
        />
      </div>

      {/* Selector de provider + presets */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
          Proveedor
        </label>
        <div className="flex gap-2 flex-wrap mb-3">
          <button
            onClick={() => providerPreset("gmail")}
            className={`text-xs px-2 py-1 rounded border ${providerKind === "smtp" && smtpHost === "smtp.gmail.com" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600"}`}
          >
            ðŸ“¨ Gmail
          </button>
          <button
            onClick={() => providerPreset("outlook")}
            className={`text-xs px-2 py-1 rounded border ${providerKind === "smtp" && smtpHost === "smtp-mail.outlook.com" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600"}`}
          >
            ðŸ“§ Outlook
          </button>
          <button
            onClick={() => providerPreset("sendgrid")}
            className={`text-xs px-2 py-1 rounded border ${providerKind === "sendgrid" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600"}`}
          >
            âš¡ SendGrid
          </button>
        </div>
        {providerKind === "smtp" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input
                label="Host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="col-span-2"
              />
              <Input
                label="Puerto"
                type="number"
                value={smtpPort}
                onChange={(e) =>
                  setSmtpPort(parseInt(e.target.value, 10) || 587)
                }
              />
            </div>
            <Input
              label="Usuario"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="cuenta@gmail.com"
            />
            <Input
              label="ContraseÃ±a / App Password"
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={
                mode === "edit" ? "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢ (dejar vacÃ­o para mantener)" : ""
              }
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                className="rounded"
              />
              <span className="text-slate-700">
                SSL/TLS (puerto 465 â€” desmarcar para STARTTLS en 587)
              </span>
            </label>
            <p className="text-[11px] text-slate-400">
              <strong>Gmail:</strong> requiere App Password (2FA +{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                myaccount.google.com/apppasswords
              </a>
              ). No uses tu contraseÃ±a normal.
            </p>
          </div>
        ) : (
          <div>
            <Input
              label="API Key de SendGrid"
              type="password"
              value={sendgridKey}
              onChange={(e) => setSendgridKey(e.target.value)}
              placeholder="SG.xxxxxxxxxxxxxxxxxxxx"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              ObtÃ©n tu API key en{" "}
              <a
                href="https://app.sendgrid.com/settings/api_keys"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                SendGrid â†’ Settings â†’ API Keys
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Acciones: verificar + test send */}
      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleVerify}
            disabled={verifying}
          >
            {verifying ? "Verificandoâ€¦" : "ðŸ”Œ Verificar conexiÃ³n"}
          </Button>
          <span className="text-[11px] text-slate-500">
            Probar SMTP/SendGrid sin enviar email real.
          </span>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            placeholder="destino@ejemplo.co"
            value={testingTo}
            onChange={(e) => setTestingTo(e.target.value)}
            className="flex-1 min-w-[180px]"
          />
          <Button size="sm" onClick={handleTestSend} disabled={testing}>
            {testing ? "Enviandoâ€¦" : "âœ‰ï¸ Enviar prueba"}
          </Button>
        </div>
      </div>

      <div className="pt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSave}>
          {mode === "create" ? "Crear buzÃ³n" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

