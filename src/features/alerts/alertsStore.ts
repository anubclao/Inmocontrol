/**
 * Store de Alertas.
 *
 * Separa dos responsabilidades:
 *  - `alerts` (NO persistido): la lista derivada, recomputada cada vez que
 *    cambian los datos. La UI la lee con un selector fino.
 *  - `dismissed` (persistido): IDs que el usuario descartó. Persiste entre
 *    recargas para que el "dismiss" no se pierda al refrescar.
 *
 * El provider que dispara la derivación es `App.tsx` (después del hydrate),
 * llamando a `useAlertsStore.getState().setAlerts(deriveAlerts({...}))`.
 * Más adelante, en Fase 2, este setAlerts() será reemplazado por un motor
 * basado en reglas configurables.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Alert } from './types';

interface AlertsState {
  /** Lista derivada (ordenada por severidad). NO persistida. */
  alerts: Alert[];
  /** IDs que el usuario descartó. Persistidos. */
  dismissed: string[];

  /** Reemplaza la lista derivada (lo llama el provider en cada cambio de datos). */
  setAlerts: (alerts: Alert[]) => void;
  /** Marca como descartada (la oculta del dashboard). */
  dismiss: (id: string) => void;
  /** Revierte un dismiss (la vuelve a mostrar). */
  undismiss: (id: string) => void;
  /** Limpia todas las descartadas. */
  clearDismissed: () => void;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      dismissed: [],

      setAlerts: (alerts) => set({ alerts }),
      dismiss: (id) =>
        set((s) => (s.dismissed.includes(id) ? s : { dismissed: [...s.dismissed, id] })),
      undismiss: (id) => set((s) => ({ dismissed: s.dismissed.filter((x) => x !== id) })),
      clearDismissed: () => set({ dismissed: [] }),
    }),
    {
      name: 'inmocontrol:alerts:dismissed:v1',
      storage: createJSONStorage(() => localStorage),
      // Solo persistimos `dismissed`. `alerts` se rederiva en cada load.
      partialize: (s) => ({ dismissed: s.dismissed }),
    },
  ),
);

/** Selector útil: alertas visibles (=total - descartadas), ordenadas. */
export const selectVisibleAlerts = (s: AlertsState): Alert[] => {
  if (s.dismissed.length === 0) return s.alerts;
  const dismissed = new Set(s.dismissed);
  return s.alerts.filter((a) => !dismissed.has(a.id));
};
