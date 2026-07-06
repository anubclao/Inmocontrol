import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Settings persistentes (agency + profile del usuario actual).
 *
 * Por qué existe: el `SettingsView` original tenía `agency` y `profile` en
 * `useState` local — se perdían al refrescar y otros componentes no podían
 * leerlos. Esto centraliza en Zustand para que (a) persistan y (b) el
 * generador de PDF / el wizard de firmas puedan usarlos.
 *
 * Decisión de scope: hoy la app es demo (sin auth real), así que `profile`
 * representa al usuario que está usando la app — el "agente" que firma.
 */

export interface AgencyInfo {
  name: string;
  nit: string;
  address: string;
  city: string;
  representative: string;
  website: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  role: string;
  /** Foto del usuario en base64 (comprimida) — opcional */
  photoDataUrl?: string;
}

interface SettingsState {
  agency: AgencyInfo;
  profile: UserProfile;
  updateAgency: (patch: Partial<AgencyInfo>) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  reset: () => void;
}

const DEFAULT_AGENCY: AgencyInfo = {
  name: 'Inmocontrol Bogotá',
  nit: '900.123.456-7',
  address: 'Calle 100 # 15-20, Oficina 502',
  city: 'Bogotá D.C.',
  representative: 'Carlos Rodríguez',
  website: 'www.inmocontrol.com',
};

const DEFAULT_PROFILE: UserProfile = {
  name: 'Tatiana Pérez',
  email: 'tatiana.perez@inmocontrol.com',
  phone: '+57 300 123 4567',
  role: 'Administradora Senior',
  photoDataUrl: undefined,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      agency: { ...DEFAULT_AGENCY },
      profile: { ...DEFAULT_PROFILE },
      updateAgency: (patch) => set((s) => ({ agency: { ...s.agency, ...patch } })),
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      reset: () => set({ agency: { ...DEFAULT_AGENCY }, profile: { ...DEFAULT_PROFILE } }),
    }),
    {
      name: 'inmocontrol:settings:v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
