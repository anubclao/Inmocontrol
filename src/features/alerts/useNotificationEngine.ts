/**
 * Motor de notificaciones.
 *
 * Toma las alertas derivadas + la config del usuario y produce las
 * notificaciones que se "enviarían" por cada canal × audiencia.
 *
 * Hoy el envío es real para WhatsApp (Twilio) y Email (SMTP/SendGrid vía
 * backend con nodemailer). El motor decide qué buzón de email usar
 * resolviendo por `categoryToEmailPurpose(category)`.
 *
 * API:
 *  - `sendForAlert(alert)` → expande 1 alerta en N notificaciones (1 por canal × audiencia)
 *  - `sendAll(alerts)`    → igual pero para todas las alertas pendientes
 *  - `previewForAlert(alert)` → devuelve las notificaciones que SE generarían
 *    (sin enviarlas). Útil para mostrar al usuario qué va a salir antes de confirmar.
 */

import type { Alert } from "./types";
import { ALERT_CATEGORY_LABEL } from "./types";
import type {
  AlertRule,
  Audience,
  ChannelType,
  ConfigurableCategory,
  EmailMailbox,
} from "./ruleTypes";
import {
  AUDIENCE_LABEL,
  CATEGORY_LABEL,
  categoryToEmailPurpose,
} from "./ruleTypes";
import {
  selectMailboxForPurpose,
  useNotificationConfigStore,
} from "./notificationConfigStore";
import { getAdapter } from "./channels";
import { useAppStore } from "../../shared/store/appStore";
import { useSettingsStore } from "../../shared/store/settingsStore";

export interface PlannedNotification {
  channel: ChannelType;
  audience: Audience;
  recipientName: string;
  recipientHandle: string;
  subject: string;
  body: string;
  /** Si es email, el buzón que se usaría (para preview transparente). */
  mailbox?: EmailMailbox;
}

/** Resuelve la data del destinatario según audiencia. Devuelve null si no hay forma
 *  de entregar (ej: tenant sin teléfono para WhatsApp). El caller decide si skip. */
function resolveRecipient(
  audience: Audience,
  alert: Alert,
): { name: string; handle: string } | null {
  const tenants = useAppStore.getState().tenants;
  const properties = useAppStore.getState().properties;
  const profile = useSettingsStore.getState().profile;

  if (audience === "agent") {
    return {
      name: profile.name || "Agente",
      handle: profile.email || "agente@inmocontrol.co",
    };
  }

  if (audience === "tenant") {
    const tenant = alert.entity.tenantId
      ? tenants.find((t) => t.id === alert.entity.tenantId)
      : undefined;
    if (!tenant) return null;
    if (tenant.phone) return { name: tenant.name, handle: tenant.phone };
    if (tenant.email) return { name: tenant.name, handle: tenant.email };
    return { name: tenant.name, handle: "sin contacto" };
  }

  // owner
  const property = alert.entity.propertyId
    ? properties.find((p) => p.id === alert.entity.propertyId)
    : undefined;
  if (!property) return null;
  // AGENTS.md: Property guarda ownerId pero el Owner como entidad no está
  // modelado en stores. Usamos el address como label y un email genérico.
  return {
    name: "Propietario",
    handle: `owner-${property.ownerId}@inmocontrol.co`,
  };
}

/** Compone subject + body para una alerta × canal × audiencia. */
function composeMessage(
  alert: Alert,
  channel: ChannelType,
  audience: Audience,
): { subject: string; body: string } {
  const cat =
    CATEGORY_LABEL[alert.category as ConfigurableCategory] ??
    ALERT_CATEGORY_LABEL[alert.category];
  const aud = AUDIENCE_LABEL[audience];

  // Subject corto (asunto de email / primer línea de WhatsApp / título push)
  const subject = `[${cat}] ${alert.title}`;

  // Body — depende del canal
  if (channel === "whatsapp") {
    return {
      subject,
      body:
        aud === "Inquilino"
          ? `Hola 👋\n\n${alert.title}\n${alert.description}\n\nPor favor revisa tu cuenta de cobro. Si ya pagaste, ignora este mensaje.`
          : aud === "Propietario"
            ? `Hola,\n\n${alert.title}\n${alert.description}\n\nRevisa el detalle en la app.`
            : `🔔 ${alert.title}\n${alert.description}`,
    };
  }

  if (channel === "email") {
    return {
      subject,
      body:
        `Categoría: ${cat}\n` +
        `Detalle: ${alert.description}\n\n` +
        `— Equipo InmoControl`,
    };
  }

  // in_app
  return { subject, body: alert.description };
}

function ruleMatchesCategory(
  rule: AlertRule | undefined,
  alert: Alert,
): rule is AlertRule {
  if (!rule) return false;
  if (!rule.enabled) return false;
  if (rule.category !== (alert.category as ConfigurableCategory)) return false;
  return true;
}

/** Devuelve las notificaciones que SE generarían para esta alerta (sin enviar). */
export function previewForAlert(alert: Alert): PlannedNotification[] {
  const config = useNotificationConfigStore.getState();
  const rule = config.rules.find((r) => r.category === alert.category);

  if (!ruleMatchesCategory(rule, alert)) return [];

  const globalChannel = (t: ChannelType) =>
    config.channels.find((c) => c.type === t);
  const out: PlannedNotification[] = [];

  // Resolver buzón de email una sola vez por alerta (mismo purpose para todas las audiencias).
  const emailPurpose = categoryToEmailPurpose(
    alert.category as ConfigurableCategory,
  );
  const mailbox = selectMailboxForPurpose(config, emailPurpose);

  for (const channel of rule.channels) {
    const ch = globalChannel(channel);
    if (!ch || !ch.enabled || !ch.connected) continue;
    // Para email, además del switch global, debe haber un buzón configurado.
    if (channel === "email" && !mailbox) continue;
    for (const audience of rule.audiences) {
      const recipient = resolveRecipient(audience, alert);
      if (!recipient || recipient.handle === "sin contacto") continue;
      const { subject, body } = composeMessage(alert, channel, audience);
      out.push({
        channel,
        audience,
        recipientName: recipient.name,
        recipientHandle: recipient.handle,
        subject,
        body,
        ...(channel === "email" && mailbox ? { mailbox } : {}),
      });
    }
  }
  return out;
}

/** Envía las notificaciones de UNA alerta a través de los adapters.
 *  Devuelve cuántas se enviaron efectivamente. */
export function sendForAlert(alert: Alert): number {
  const planned = previewForAlert(alert);
  for (const p of planned) {
    getAdapter(p.channel)({
      channel: p.channel,
      audience: p.audience,
      recipient: p.recipientName,
      recipientHandle: p.recipientHandle,
      subject: p.subject,
      body: p.body,
      alertId: alert.id,
      alertCategory: alert.category,
      ...(p.mailbox ? { mailbox: p.mailbox } : {}),
    });
  }
  return planned.length;
}

/** Envía TODAS las alertas pendientes (post-filter de dismissed). */
export function sendAll(alerts: Alert[]): { sent: number; skipped: number } {
  let sent = 0;
  let skipped = 0;
  for (const a of alerts) {
    const n = sendForAlert(a);
    if (n > 0) sent += n;
    else skipped += 1;
  }
  return { sent, skipped };
}
