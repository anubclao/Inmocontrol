/**
 * Adapters de canal.
 *
 * Patrón:
 *  - Cada adapter recibe `SendParams` y devuelve `Promise<NotificationEntry>`
 *  - Inserta la entry en `notificationLogStore` con status `pending` de inmediato
 *    (la UI la ve aparecer y luego transicionar a `sent` o `failed`)
 *  - Intenta el envío real. Si falla o si Twilio no está configurado, la entry
 *    queda como `failed` con `errorMessage`
 *
 * Estado actual (Fase 7):
 *  - WhatsApp: real vía Twilio (sandbox o producción)
 *  - Email:    real vía SMTP/SendGrid con nodemailer en el backend, multi-buzón por propósito
 *  - In-App:   mock (solo log, sin push real)
 *
 * En producción cada adapter real llama a su provider vía backend:
 *  - WhatsApp: Twilio API
 *  - Email:    SMTP / SendGrid / Resend
 *  - In-App:   WebSocket / push provider
 *
 * NOTA DE SEGURIDAD (SaaS-ready):
 *  El adapter de email pasa la config del buzón (incluyendo SMTP_PASS) al
 *  backend en cada request. Aceptable en localhost para desarrollo single-tenant.
 *  Para SaaS multi-tenant: el backend debe almacenar credenciales cifradas y
 *  el frontend solo conoce IDs de buzón, nunca las credenciales.
 */

import type { ChannelType, Audience, EmailMailbox } from './ruleTypes';
import { CHANNEL_LABEL } from './ruleTypes';
import type { NotificationEntry, NotificationStatus } from './notificationLogStore';
import { useNotificationLogStore } from './notificationLogStore';

export interface SendParams {
  channel: ChannelType;
  recipient: string;        // nombre
  recipientHandle: string;  // teléfono / email / "Agente"
  subject: string;
  body: string;
  alertId: string;
  alertCategory: string;
  audience: Audience;
  /** Solo email: el buzón concreto a usar (resuelto por el engine). */
  mailbox?: EmailMailbox;
}

export type ChannelAdapter = (params: SendParams) => Promise<NotificationEntry>;

const ICON: Record<ChannelType, string> = {
  whatsapp: '💬',
  email: '📧',
  in_app: '🔔',
};

const genId = () => `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Crea la entry en log y la devuelve. El status inicial es 'pending'. */
function createEntry(p: SendParams, status: NotificationStatus = 'pending', extra?: { errorMessage?: string; providerId?: string }): NotificationEntry {
  const entry: NotificationEntry = {
    id: genId(),
    channel: p.channel,
    audience: p.audience,
    alertId: p.alertId,
    alertCategory: p.alertCategory,
    recipientName: p.recipient,
    recipientHandle: p.recipientHandle,
    subject: p.subject,
    body: p.body,
    status,
    sentAt: new Date().toISOString(),
    ...extra,
  };
  useNotificationLogStore.getState().append(entry);
  return entry;
}

function setStatus(id: string, status: NotificationStatus, extra?: { errorMessage?: string; providerId?: string }) {
  useNotificationLogStore.getState().updateStatus(id, status, extra);
}

// ─── WhatsApp (REAL vía Twilio) ──────────────────────────────────────────

export const whatsappAdapter: ChannelAdapter = async (p) => {
  // 1. Inserta la entry como 'pending' (la UI la ve aparecer)
  const entry = createEntry(p, 'pending');

  // 2. Llama al backend (que tiene las credenciales de Twilio)
  try {
    const res = await fetch('/api/notifications/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: p.recipientHandle, body: p.body, alertId: p.alertId }),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const errorMessage = data?.message ?? data?.error ?? `HTTP ${res.status}`;
      setStatus(entry.id, 'failed', { errorMessage });
      console.warn(`[whatsappAdapter] Fallo: ${errorMessage}`);
      return { ...entry, status: 'failed', errorMessage };
    }
    setStatus(entry.id, 'sent', { providerId: data?.sid });
    return { ...entry, status: 'sent', providerId: data?.sid };
  } catch (err: any) {
    const errorMessage = err?.message ?? 'Error de red';
    setStatus(entry.id, 'failed', { errorMessage });
    return { ...entry, status: 'failed', errorMessage };
  }
};

// ─── Email (REAL vía SMTP/SendGrid en el backend) ────────────────────────

export const emailAdapter: ChannelAdapter = async (p) => {
  const entry = createEntry(p, 'pending');

  if (!p.mailbox) {
    const errorMessage = 'Sin buzón configurado. Agrega uno en Settings → Integraciones → Email.';
    setStatus(entry.id, 'failed', { errorMessage });
    return { ...entry, status: 'failed', errorMessage };
  }

  try {
    const res = await fetch('/api/notifications/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailbox: {
          purpose: p.mailbox.purpose,
          fromName: p.mailbox.fromName,
          fromEmail: p.mailbox.fromEmail,
          replyTo: p.mailbox.replyTo,
          provider: p.mailbox.provider,
        },
        to: p.recipientHandle,
        subject: p.subject,
        body: p.body,
        html: true,
        alertId: p.alertId,
      }),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const errorMessage = data?.error ?? data?.message ?? `HTTP ${res.status}`;
      setStatus(entry.id, 'failed', { errorMessage });
      console.warn(`[emailAdapter] Fallo: ${errorMessage}`);
      return { ...entry, status: 'failed', errorMessage };
    }
    setStatus(entry.id, 'sent', { providerId: data?.messageId ?? `email:${p.mailbox.purpose}` });
    return { ...entry, status: 'sent', providerId: data?.messageId ?? `email:${p.mailbox.purpose}` };
  } catch (err: any) {
    const errorMessage = err?.message ?? 'Error de red';
    setStatus(entry.id, 'failed', { errorMessage });
    return { ...entry, status: 'failed', errorMessage };
  }
};

// ─── In-App (MOCK — solo log local) ─────────────────────────────────────

export const inAppAdapter: ChannelAdapter = async (p) => {
  const entry = createEntry(p, 'pending');
  console.info(`[InApp MOCK→${p.recipientHandle}] ${p.subject}`);
  setStatus(entry.id, 'sent', { providerId: 'mock-in-app' });
  return { ...entry, status: 'sent', providerId: 'mock-in-app' };
};

export const ADAPTERS: Record<ChannelType, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  email: emailAdapter,
  in_app: inAppAdapter,
};

export const getAdapter = (type: ChannelType): ChannelAdapter => ADAPTERS[type];

export { CHANNEL_LABEL, ICON };
