/**
 * Configuración de notificaciones — Zustand con persist.
 *
 * Mantiene:
 *  1. `channels` (config de infraestructura por canal) — `connected`, `enabled`, identifier
 *  2. `rules` (config por categoría de alerta) — qué canales, qué audiencias, offset
 *  3. `emailConfig` (Fase 7) — multi-buzón por propósito, listo para SaaS per-agency
 *
 * Defaults pensados para el flujo colombiano:
 *  - Mora: WhatsApp al inquilino + email al propietario + in-app al agente
 *  - Vencimiento: email al propietario + in-app al agente
 *  - Preaviso: email al propietario + in-app al agente
 *  - Documento (mandato): in-app al agente
 *
 * Si el usuario quiere cambiar el comportamiento, lo hace desde el módulo
 * de Alertas. La config persiste en localStorage.
 *
 * Migración futura a SaaS: la forma de `emailConfig` ya es per-agency, así
 * que cuando metamos DB + multi-tenant solo se mueve a la tabla `agency`.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AlertRule,
  ChannelConfig,
  ConfigurableCategory,
  EmailConfig,
  EmailMailbox,
  EmailPurpose,
} from './ruleTypes';

const DEFAULT_CHANNELS: ChannelConfig[] = [
  { type: 'whatsapp', enabled: true, connected: true, identifier: '+57 300 123 4567 (Sandbox)' },
  { type: 'email', enabled: true, connected: true, identifier: '0 buzones configurados' },
  { type: 'in_app', enabled: true, connected: true },
];

const DEFAULT_RULES: AlertRule[] = [
  {
    category: 'mora',
    enabled: true,
    channels: ['whatsapp', 'email', 'in_app'],
    audiences: ['tenant', 'owner', 'agent'],
    offsetDays: 1,
    notes: 'Recordatorio 1 día después del vencimiento',
  },
  {
    category: 'vencimiento',
    enabled: true,
    channels: ['email', 'in_app'],
    audiences: ['owner', 'agent'],
    offsetDays: 60,
    notes: 'Avisar 60 días antes del fin del contrato',
  },
  {
    category: 'preaviso',
    enabled: true,
    channels: ['email', 'in_app'],
    audiences: ['owner', 'agent'],
    offsetDays: 0,
    notes: 'Día que se cumple el preaviso de no renovación',
  },
  {
    category: 'documento',
    enabled: true,
    channels: ['in_app'],
    audiences: ['agent'],
    offsetDays: 0,
    notes: 'Mandato sin firmar en propiedad activa',
  },
];

const DEFAULT_EMAIL_CONFIG: EmailConfig = { mailboxes: [] };

const genId = () => `mb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface NotificationConfigState {
  channels: ChannelConfig[];
  rules: AlertRule[];
  emailConfig: EmailConfig;

  // ── Channel ops
  setChannelEnabled: (type: ChannelConfig['type'], enabled: boolean) => void;
  setChannelConnected: (type: ChannelConfig['type'], connected: boolean) => void;
  setChannelIdentifier: (type: ChannelConfig['type'], identifier: string) => void;

  // ── Rule ops
  updateRule: (category: ConfigurableCategory, patch: Partial<AlertRule>) => void;
  toggleRule: (category: ConfigurableCategory) => void;
  toggleRuleChannel: (category: ConfigurableCategory, channel: AlertRule['channels'][number]) => void;
  toggleRuleAudience: (category: ConfigurableCategory, audience: AlertRule['audiences'][number]) => void;

  // ── Email mailbox ops
  addMailbox: (mailbox: Omit<EmailMailbox, 'id' | 'createdAt'>) => string;
  updateMailbox: (id: string, patch: Partial<EmailMailbox>) => void;
  removeMailbox: (id: string) => void;
  toggleMailbox: (id: string) => void;
  setDefaultMailbox: (id: string | undefined) => void;

  reset: () => void;
}

export const useNotificationConfigStore = create<NotificationConfigState>()(
  persist(
    (set) => ({
      channels: DEFAULT_CHANNELS,
      rules: DEFAULT_RULES,
      emailConfig: DEFAULT_EMAIL_CONFIG,

      setChannelEnabled: (type, enabled) =>
        set((s) => ({ channels: s.channels.map((c) => (c.type === type ? { ...c, enabled } : c)) })),
      setChannelConnected: (type, connected) =>
        set((s) => ({ channels: s.channels.map((c) => (c.type === type ? { ...c, connected } : c)) })),
      setChannelIdentifier: (type, identifier) =>
        set((s) => ({ channels: s.channels.map((c) => (c.type === type ? { ...c, identifier } : c)) })),

      updateRule: (category, patch) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.category === category ? { ...r, ...patch } : r)),
        })),
      toggleRule: (category) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.category === category ? { ...r, enabled: !r.enabled } : r)),
        })),
      toggleRuleChannel: (category, channel) =>
        set((s) => ({
          rules: s.rules.map((r) => {
            if (r.category !== category) return r;
            const has = r.channels.includes(channel);
            const channels = has ? r.channels.filter((c) => c !== channel) : [...r.channels, channel];
            return { ...r, channels };
          }),
        })),
      toggleRuleAudience: (category, audience) =>
        set((s) => ({
          rules: s.rules.map((r) => {
            if (r.category !== category) return r;
            const has = r.audiences.includes(audience);
            const audiences = has ? r.audiences.filter((a) => a !== audience) : [...r.audiences, audience];
            return { ...r, audiences };
          }),
        })),

      addMailbox: (mb) => {
        const id = genId();
        const newMb: EmailMailbox = { ...mb, id, createdAt: new Date().toISOString() };
        set((s) => ({
          emailConfig: {
            ...s.emailConfig,
            mailboxes: [...s.emailConfig.mailboxes, newMb],
            // Si es el primer buzón, lo marcamos como default automáticamente.
            defaultMailboxId: s.emailConfig.defaultMailboxId ?? id,
          },
        }));
        return id;
      },
      updateMailbox: (id, patch) =>
        set((s) => ({
          emailConfig: {
            ...s.emailConfig,
            mailboxes: s.emailConfig.mailboxes.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          },
        })),
      removeMailbox: (id) =>
        set((s) => {
          const remaining = s.emailConfig.mailboxes.filter((m) => m.id !== id);
          return {
            emailConfig: {
              mailboxes: remaining,
              defaultMailboxId:
                s.emailConfig.defaultMailboxId === id
                  ? remaining[0]?.id
                  : s.emailConfig.defaultMailboxId,
            },
          };
        }),
      toggleMailbox: (id) =>
        set((s) => ({
          emailConfig: {
            ...s.emailConfig,
            mailboxes: s.emailConfig.mailboxes.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
          },
        })),
      setDefaultMailbox: (id) =>
        set((s) => ({ emailConfig: { ...s.emailConfig, defaultMailboxId: id } })),

      reset: () => set({ channels: DEFAULT_CHANNELS, rules: DEFAULT_RULES, emailConfig: DEFAULT_EMAIL_CONFIG }),
    }),
    {
      name: 'inmocontrol:notification-config:v1',
      storage: createJSONStorage(() => localStorage),
      // Migración: si el localStorage viejo no tiene emailConfig, mergear con default.
      version: 2,
      migrate: (persisted: any, _version) => {
        if (!persisted) return persisted;
        if (!persisted.emailConfig) persisted.emailConfig = DEFAULT_EMAIL_CONFIG;
        return persisted;
      },
    },
  ),
);

/** Selector: devuelve el buzón a usar para un `purpose` (o el default). */
export function selectMailboxForPurpose(state: NotificationConfigState, purpose: EmailPurpose): EmailMailbox | undefined {
  const enabled = state.emailConfig.mailboxes.filter((m) => m.enabled);
  return (
    enabled.find((m) => m.purpose === purpose) ??
    enabled.find((m) => m.id === state.emailConfig.defaultMailboxId) ??
    enabled[0]
  );
}
