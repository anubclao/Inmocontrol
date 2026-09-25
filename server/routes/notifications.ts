/**
 * InmoControl — Endpoints de Notificaciones
 * ============================================================================
 * Cubre WhatsApp (vía Twilio) y Email (vía SMTP/SendGrid con nodemailer).
 *
 * ── WhatsApp ─────────────────────────────────────────────────────────────
 *   GET  /api/notifications/whatsapp/status     — health check del canal
 *   POST /api/notifications/whatsapp             — envía un mensaje (uso interno del engine)
 *   POST /api/notifications/whatsapp/test        — envía un mensaje de prueba a un número dado
 *
 * ── Email (Fase 7) ────────────────────────────────────────────────────────
 *   GET  /api/notifications/email/status        — status global (paquete + fallback env)
 *   POST /api/notifications/email/verify        — verifica SMTP/SendGrid sin enviar
 *   POST /api/notifications/email/test          — envía un email de prueba
 *   POST /api/notifications/email/send          — envía una notificación (uso interno del engine)
 *
 * ── Notas ─────────────────────────────────────────────────────────────────
 * - WhatsApp: credenciales en env (`TWILIO_*`), compartidas.
 * - Email: en MVP single-tenant, el frontend pasa la config del mailbox
 *   (incluyendo SMTP pass) en cada request. Esto es aceptable en localhost
 *   para desarrollo. Para SaaS multi-tenant: mover a backend cifrado y nunca
 *   exponer las credenciales al cliente.
 * - Si la agencia NO configura mailboxes propios, el server puede usar el
 *   fallback de env (`SMTP_*` o `SENDGRID_API_KEY`).
 *
 * Comportamiento si Twilio no está configurado (alguna env var falta):
 *   - /status devuelve `{ configured: false, mode: 'mock' }`
 *   - /whatsapp y /whatsapp/test devuelven `503` con `{ error: 'TWILIO_NOT_CONFIGURED' }`
 *   - El frontend hace fallback a log local (no rompe la app)
 *
 * Sandbox Twilio (gratis):
 *   - Número remitente: `whatsapp:+14155238886`
 *   - El destinatario debe mandar "join <palabra>" al sandbox desde su WhatsApp
 *   - Ver `.env.example` para las 3 variables requeridas
 */

import { Router } from 'express';
// FIX #2 (P0 seguridad): requireAuth en notificaciones (Twilio WhatsApp + email).
import { requireAuth } from './auth.js';
// fix-issue-permissions-by-endpoint: gestión de canales requiere canManageNotifications.
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();
router.use(requireAuth);

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  whatsappFrom: string;
}

function readTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !whatsappFrom) return null;
  return { accountSid, authToken, whatsappFrom };
}

let _client: any = null;
async function getClient() {
  if (_client) return _client;
  const cfg = readTwilioConfig();
  if (!cfg) return null;
  // Import dinámico: si la dep no está instalada (ej: build de CI), no rompe el server.
  try {
    const mod = await import('twilio');
    const twilio = (mod as any).default ?? mod;
    _client = twilio(cfg.accountSid, cfg.authToken);
    return _client;
  } catch (err) {
    console.error('[notifications] twilio no instalado. Ejecuta `npm install`.', err);
    return null;
  }
}

/** Normaliza un teléfono colombiano a formato E.164 para Twilio.
 *  Acepta: +57 300 123 4567 | 573001234567 | 3001234567 | 300 123 4567 */
function normalizeColombianPhone(input: string): string | null {
  if (!input) return null;
  const cleaned = String(input).replace(/[\s\-()]/g, '');
  if (/^\+?57\d{10}$/.test(cleaned)) {
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }
  if (/^3\d{9}$/.test(cleaned)) return `+57${cleaned}`;
  // Si ya viene con + y 10-15 dígitos, lo dejamos
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;
  return null;
}

// ─── GET /whatsapp/status ────────────────────────────────────────────────
// BUG-029: migrado a asyncHandler.
router.get('/whatsapp/status', asyncHandler(async (_req, res) => {
  const cfg = readTwilioConfig();
  if (!cfg) {
    return res.json({
      configured: false,
      mode: 'mock',
      from: null,
      message: 'Twilio no configurado. Agrega TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM a .env.local',
    });
  }
  const client = await getClient();
  if (!client) {
    return res.json({
      configured: false,
      mode: 'mock',
      from: cfg.whatsappFrom,
      message: 'Paquete twilio no instalado. Ejecuta `npm install`.',
    });
  }
  // Si el cliente cargó OK, el canal está en modo live.
  res.json({
    configured: true,
    mode: 'live',
    from: cfg.whatsappFrom,
    message: 'Conectado. Listo para enviar.',
  });
}));

// ─── POST /whatsapp (uso interno del engine de notificaciones) ──────────
// BUG-029: migrado a asyncHandler.
router.post('/whatsapp', requireRole('canManageNotifications'), asyncHandler(async (req, res) => {
  const { to, body, alertId } = req.body as { to?: string; body?: string; alertId?: string };
  if (!to || !body) {
    return res.status(400).json({ error: 'Faltan campos: to, body' });
  }
  const phone = normalizeColombianPhone(to);
  if (!phone) {
    return res.status(400).json({ error: `Número inválido: "${to}". Esperado formato colombiano (+57 3XX XXX XXXX).` });
  }
  const client = await getClient();
  if (!client) {
    return res.status(503).json({ error: 'TWILIO_NOT_CONFIGURED', message: 'Twilio no configurado en el server' });
  }
  const cfg = readTwilioConfig()!;
  try {
    const msg = await client.messages.create({
      from: cfg.whatsappFrom,
      to: `whatsapp:${phone}`,
      body,
    });
    console.info(`[notifications/whatsapp] alert=${alertId ?? 'n/a'} to=${phone} sid=${msg.sid} status=${msg.status}`);
    res.json({ ok: true, sid: msg.sid, status: msg.status, to: phone });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Twilio error', code: err.code });
  }
}));

// ─── POST /whatsapp/test (botón "Probar" del modal de Configuración) ───
// BUG-029: migrado a asyncHandler.
router.post('/whatsapp/test', requireRole('canManageNotifications'), asyncHandler(async (req, res) => {
  const { to } = req.body as { to?: string };
  if (!to) return res.status(400).json({ error: 'Falta campo: to' });
  const phone = normalizeColombianPhone(to);
  if (!phone) return res.status(400).json({ error: `Número inválido: "${to}"` });
  const client = await getClient();
  if (!client) {
    return res.status(503).json({ error: 'TWILIO_NOT_CONFIGURED', message: 'Twilio no configurado en el server' });
  }
  const cfg = readTwilioConfig()!;
  try {
    const msg = await client.messages.create({
      from: cfg.whatsappFrom,
      to: `whatsapp:${phone}`,
      body: '🧪 Mensaje de prueba desde InmoControl. Si lees esto, Twilio está conectado correctamente.',
    });
    res.json({ ok: true, sid: msg.sid, status: msg.status, to: phone });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Twilio error', code: err.code });
  }
}));

// ════════════════════════════════════════════════════════════════════════════
// EMAIL (Fase 7)
// ════════════════════════════════════════════════════════════════════════════

/**
 * El cuerpo del request de email trae la config del mailbox a usar.
 * (En SaaS real, el backend resolvería desde DB cifrada — ver nota al inicio).
 */
type EmailProviderConfig =
  | { kind: 'smtp'; host: string; port: number; user: string; pass: string; secure: boolean }
  | { kind: 'sendgrid'; apiKey: string };

interface EmailRequestBody {
  /** Mailbox a usar. Si se omite, intenta el fallback de env. */
  mailbox?: {
    purpose: string;
    fromName: string;
    fromEmail: string;
    replyTo?: string;
    provider: EmailProviderConfig;
  };
  to: string;
  subject: string;
  body: string;
  /** Si true, manda como HTML (envuelve el body en una plantilla mínima). */
  html?: boolean;
  alertId?: string;
}

let _nodemailer: any = null;
async function getNodemailer() {
  if (_nodemailer) return _nodemailer;
  // Import dinámico (ESM no tiene `require`): si la dep no está instalada, no rompe el server.
  try {
    const mod = await import('nodemailer');
    _nodemailer = mod.default ?? mod;
    return _nodemailer;
  } catch (err: any) {
    console.error('[notifications/email] nodemailer no instalado. Ejecuta `npm install`.', err?.message ?? err);
    return null;
  }
}

/** Normaliza el provider a una config de nodemailer. */
function providerToTransport(provider: EmailProviderConfig) {
  if (provider.kind === 'sendgrid') {
    return {
      transport: {
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: { user: 'apikey', pass: provider.apiKey },
      },
      providerLabel: 'sendgrid',
    };
  }
  // smtp
  return {
    transport: {
      host: provider.host,
      port: provider.port,
      secure: provider.secure,
      auth: { user: provider.user, pass: provider.pass },
    },
    providerLabel: `smtp:${provider.host}:${provider.port}`,
  };
}

/** Lee el fallback SMTP/SendGrid de env (modo "centralized"). */
function readEmailFallback(): NonNullable<EmailRequestBody['mailbox']> | null {
  if (process.env.EMAIL_FALLBACK_ENABLED !== 'true') return null;

  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    return {
      purpose: 'fallback',
      fromName: process.env.EMAIL_FROM_NAME || 'InmoControl',
      fromEmail: process.env.EMAIL_FROM_EMAIL || 'noreply@inmocontrol.co',
      provider: { kind: 'sendgrid', apiKey: sendgridKey },
    };
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    return {
      purpose: 'fallback',
      fromName: process.env.EMAIL_FROM_NAME || 'InmoControl',
      fromEmail: process.env.EMAIL_FROM_EMAIL || user,
      provider: {
        kind: 'smtp',
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user,
        pass,
        secure: process.env.SMTP_SECURE === 'true',
      },
    };
  }
  return null;
}

// ─── GET /email/status ────────────────────────────────────────────────────
// BUG-029: migrado a asyncHandler.
router.get('/email/status', asyncHandler(async (_req, res) => {
  const nodemailer = await getNodemailer();
  const fallback = readEmailFallback();
  res.json({
    packageInstalled: !!nodemailer,
    fallbackConfigured: !!fallback,
    fallbackProvider: fallback?.provider.kind ?? null,
    message: !nodemailer
      ? 'Paquete nodemailer no instalado. Ejecuta `npm install`.'
      : !fallback
      ? 'Sin fallback centralizado. Configura los buzones en Settings → Integraciones.'
      : 'Listo. Puedes usar buzones por agencia o el fallback centralizado.',
  });
}));

// ─── POST /email/verify ───────────────────────────────────────────────────
/** Verifica la conexión SMTP/SendGrid de un mailbox. No envía. */
// BUG-029: migrado a asyncHandler.
router.post('/email/verify', requireRole('canManageNotifications'), asyncHandler(async (req, res) => {
  const nodemailer = await getNodemailer();
  if (!nodemailer) {
    return res.status(503).json({ ok: false, error: 'NODEMAILER_NOT_INSTALLED', message: 'Ejecuta `npm install`' });
  }
  const { mailbox } = req.body as { mailbox?: EmailRequestBody['mailbox'] };
  if (!mailbox) return res.status(400).json({ ok: false, error: 'Falta campo: mailbox' });

  try {
    const { transport } = providerToTransport(mailbox.provider);
    const transporter = nodemailer.createTransport(transport);
    await transporter.verify();
    res.json({ ok: true, message: 'Conexión SMTP/SendGrid verificada correctamente.' });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message ?? 'Verify failed', code: err.code });
  }
}));

// ─── POST /email/test ─────────────────────────────────────────────────────
/** Envía un email de prueba al destinatario que diga el form. */
// BUG-029: migrado a asyncHandler.
router.post('/email/test', requireRole('canManageNotifications'), asyncHandler(async (req, res) => {
  const nodemailer = await getNodemailer();
  if (!nodemailer) {
    return res.status(503).json({ ok: false, error: 'NODEMAILER_NOT_INSTALLED' });
  }
  const { mailbox, to } = req.body as { mailbox?: EmailRequestBody['mailbox']; to?: string };
  if (!to) return res.status(400).json({ ok: false, error: 'Falta campo: to' });
  const mb = mailbox ?? readEmailFallback();
  if (!mb) return res.status(400).json({ ok: false, error: 'Falta mailbox y no hay fallback configurado' });

  try {
    const { transport, providerLabel } = providerToTransport(mb.provider);
    const transporter = nodemailer.createTransport(transport);
    const info = await transporter.sendMail({
      from: `"${mb.fromName}" <${mb.fromEmail}>`,
      to,
      subject: '🧪 Mensaje de prueba desde InmoControl',
      text: 'Si lees esto, tu buzón de email está conectado correctamente. — Equipo InmoControl',
      html: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb; margin: 0 0 16px;">✅ ¡Email conectado!</h2>
        <p style="color: #334155; line-height: 1.5;">Si lees esto, tu buzón <strong>${mb.fromEmail}</strong> está configurado correctamente y puede enviar notificaciones.</p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Proveedor: <code>${providerLabel}</code><br/>Propósito: ${mb.purpose}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
        <p style="color: #94a3b8; font-size: 12px;">— Equipo InmoControl</p>
      </div>`,
      replyTo: mb.replyTo,
    });
    console.info(`[notifications/email/test] to=${to} provider=${providerLabel} messageId=${info.messageId}`);
    res.json({ ok: true, messageId: info.messageId, to, provider: providerLabel });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? 'Send failed', code: err.code });
  }
}));

// ─── POST /email/send (uso interno del engine) ────────────────────────────
// BUG-029: migrado a asyncHandler.
router.post('/email/send', requireRole('canManageNotifications'), asyncHandler(async (req, res) => {
  const nodemailer = await getNodemailer();
  if (!nodemailer) {
    return res.status(503).json({ ok: false, error: 'NODEMAILER_NOT_INSTALLED' });
  }
  const { mailbox, to, subject, body, html, alertId } = req.body as EmailRequestBody;
  if (!to || !subject || !body) {
    return res.status(400).json({ ok: false, error: 'Faltan campos: to, subject, body' });
  }
  const mb = mailbox ?? readEmailFallback();
  if (!mb) return res.status(400).json({ ok: false, error: 'Falta mailbox y no hay fallback configurado' });

  try {
    const { transport, providerLabel } = providerToTransport(mb.provider);
    const transporter = nodemailer.createTransport(transport);

    // Envolvemos el body en una plantilla HTML mínima si viene html=true.
    const htmlBody = html
      ? `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #334155;">
          <h2 style="color: #1e293b; margin: 0 0 16px;">${escapeHtml(subject)}</h2>
          <div style="line-height: 1.5; white-space: pre-wrap;">${escapeHtml(body)}</div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
          <p style="color: #94a3b8; font-size: 12px;">— ${escapeHtml(mb.fromName)} vía InmoControl</p>
        </div>`
      : undefined;

    const info = await transporter.sendMail({
      from: `"${mb.fromName}" <${mb.fromEmail}>`,
      to,
      subject,
      text: body,
      html: htmlBody,
      replyTo: mb.replyTo,
    });
    console.info(`[notifications/email/send] alert=${alertId ?? 'n/a'} to=${to} provider=${providerLabel} messageId=${info.messageId}`);
    res.json({ ok: true, messageId: info.messageId, to, provider: providerLabel });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? 'Send failed', code: err.code });
  }
}));

/** Escapa HTML básico para evitar inyecciones en el subject/body. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default router;
