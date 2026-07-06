/**
 * Modelo de reglas de notificación.
 *
 * Una `AlertRule` conecta UNA categoría de alerta con los canales por los que
 * debe salir y a qué audiencias. El usuario puede:
 *  - Activar/desactivar la regla completa
 *  - Elegir canales (uno o varios)
 *  - Elegir audiencias (inquilino / propietario / agente)
 *  - Para `vencimiento` y `preaviso`, ajustar el offset temporal (días antes)
 *
 * El `ChannelConfig` separa la "infraestructura" del canal (está conectado a
 * Twilio / SMTP / etc) de la config por categoría. Así si WhatsApp Business
 * se desconecta, el switch global baja todas las reglas que lo usaban.
 *
 * Email multi-buzón (Fase 7):
 *  - Cada agencia puede definir N `EmailMailbox`, cada uno con su `purpose`.
 *  - El engine, cuando va a mandar un email, busca el mailbox con el
 *    `purpose` que mapea a la categoría de la alerta. Si no hay match, usa
 *    el `defaultMailboxId`.
 */

export type ChannelType = 'whatsapp' | 'email' | 'in_app';

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp: 'WhatsApp Business',
  email: 'Correo Electrónico',
  in_app: 'Notificación In-App',
};

/** Quién recibe la notificación. */
export type Audience = 'tenant' | 'owner' | 'agent';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  tenant: 'Inquilino',
  owner: 'Propietario',
  agent: 'Agente (tú)',
};

/** Categorías que se pueden parametrizar.
 *  (Solo las que ya tienen datos en el modelo. `novedad` y `pago` entran
 *   cuando exista el modelo de mantenimiento.) */
export type ConfigurableCategory = 'mora' | 'vencimiento' | 'preaviso' | 'documento';

export const CONFIGURABLE_CATEGORIES: ConfigurableCategory[] = [
  'mora', 'vencimiento', 'preaviso', 'documento',
];

export const CATEGORY_LABEL: Record<ConfigurableCategory, string> = {
  mora: 'Mora',
  vencimiento: 'Vencimiento de contrato',
  preaviso: 'Preaviso de no renovación',
  documento: 'Documento pendiente',
};

/** Propósito de un buzón de email —决定了 qué tipo de alerta sale por ahí.
 *  - cobros:    recordatorios de pago, mora
 *  - contratos: vencimientos, preavisos, renovaciones
 *  - alertas:   documentos pendientes, alertas generales
 *  - marketing: (futuro) campañas
 *  - general:   fallback cuando no hay match */
export type EmailPurpose = 'cobros' | 'contratos' | 'alertas' | 'marketing' | 'general';

export const EMAIL_PURPOSES: EmailPurpose[] = ['cobros', 'contratos', 'alertas', 'marketing', 'general'];

export const EMAIL_PURPOSE_LABEL: Record<EmailPurpose, string> = {
  cobros: 'Cobros',
  contratos: 'Contratos',
  alertas: 'Alertas',
  marketing: 'Marketing',
  general: 'General',
};

/** Provider concreto de un buzón. Híbrido SMTP o SendGrid. */
export type EmailProviderConfig =
  | { kind: 'smtp'; host: string; port: number; user: string; pass: string; secure: boolean }
  | { kind: 'sendgrid'; apiKey: string };

export const EMAIL_PROVIDER_LABEL = {
  smtp: 'SMTP genérico (Gmail, Outlook, hosting propio)',
  sendgrid: 'SendGrid (API)',
} as const;

/** Buzón de email — una agencia puede tener varios, uno por propósito. */
export interface EmailMailbox {
  id: string;
  purpose: EmailPurpose;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  provider: EmailProviderConfig;
  enabled: boolean;
  createdAt: string;
}

/** Config global de email (vive en notificationConfigStore, per-agency-ready). */
export interface EmailConfig {
  mailboxes: EmailMailbox[];
  /** Mailbox a usar cuando no hay match por purpose. */
  defaultMailboxId?: string;
}

/** Config de un canal a nivel infraestructura.
 *  - `connected`: mock de "está enchufado a Twilio / SMTP / push provider"
 *  - `enabled`: master switch — si false, ninguna regla usa este canal */
export interface ChannelConfig {
  type: ChannelType;
  enabled: boolean;
  connected: boolean;
  /** Para mock de credenciales — solo display. */
  identifier?: string;
}

/** Regla por categoría. */
export interface AlertRule {
  category: ConfigurableCategory;
  enabled: boolean;
  /** Canales por los que sale esta alerta. AND lógico con `channels` global enabled. */
  channels: ChannelType[];
  /** Audiencias que reciben esta alerta. */
  audiences: Audience[];
  /** Offset temporal en días.
   *  - `vencimiento`: días antes del fin (default 60)
   *  - `preaviso`:    días antes del preaviso (default 0, dispara el día)
   *  - `mora`:        días después de vencida la factura (default 1, dispara al día siguiente)
   *  - `documento`:   no aplica */
  offsetDays: number;
  /** Mensaje opcional, para futuro uso con plantillas. Hoy se ignora. */
  notes?: string;
}

/** Mapeo automático de categoría de alerta → propósito de email. */
export function categoryToEmailPurpose(c: ConfigurableCategory): EmailPurpose {
  switch (c) {
    case 'mora': return 'cobros';
    case 'vencimiento': return 'contratos';
    case 'preaviso': return 'contratos';
    case 'documento': return 'alertas';
  }
}
