/**
 * Log de notificaciones enviadas (in-memory).
 *
 * Cada adapter agrega una `NotificationEntry` cuando "envía" una notificación.
 * La UI muestra este log en la sección "Historial" de AlertsView.
 *
 * Decisión: NO persistimos el log en localStorage. Es append-only en memoria
 * porque (a) la app es demo sin backend que registre y (b) si el usuario
 * recarga, las alertas reales se re-derivan y el log se regenera limpio.
 * En Fase 5 (backend) este log sale de `/api/notifications/log`.
 */

import { create } from 'zustand';
import type { ChannelType } from './ruleTypes';
import type { Audience } from './ruleTypes';

export type NotificationStatus = 'sent' | 'failed' | 'pending';

export interface NotificationEntry {
  id: string;
  channel: ChannelType;
  audience: Audience;
  alertId: string;
  alertCategory: string;
  recipientName: string;
  recipientHandle: string;
  subject: string;
  body: string;
  status: NotificationStatus;
  sentAt: string;
  /** Si status='failed', este campo trae el mensaje de error (Twilio / network / etc). */
  errorMessage?: string;
  /** Si status='sent', este campo trae el SID del mensaje (Twilio) o equivalente. */
  providerId?: string;
}

interface NotificationLogState {
  entries: NotificationEntry[];
  append: (entry: NotificationEntry) => void;
  updateStatus: (id: string, status: NotificationStatus, extra?: { errorMessage?: string; providerId?: string }) => void;
  clear: () => void;
}

export const useNotificationLogStore = create<NotificationLogState>()((set) => ({
  entries: [],
  append: (entry) =>
    set((s) => ({ entries: [entry, ...s.entries].slice(0, 200) })), // cap 200
  updateStatus: (id, status, extra) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, status, ...extra } : e)),
    })),
  clear: () => set({ entries: [] }),
}));
