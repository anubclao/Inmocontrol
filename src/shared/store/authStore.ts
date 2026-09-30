/**
 * Auth store — Migración del user de localStorage directo a Zustand (FIX #4).
 *
 * Antes el `user` vivía en `localStorage[STORAGE_KEYS.user]` accedido desde
 * App.tsx con `useState` + `localStorage.getItem`. Esto violaba AGENTS.md:
 *   "❌ No uses `localStorage` directo fuera de `shared/store/`. Todo va por Zustand."
 *
 * Ahora: store Zustand con `persist` middleware. La clave raíz es
 * `inmocontrol:auth:v1` para no colisionar con el `inmocontrol:v1` del
 * appStore ni con los demás stores.
 *
 * El flujo:
 *   1. Mount de App → `useAuthStore.getState().hydrate()` revalida sesión con server
 *   2. handleLogin del LoginScreen → `setUser()` + server cookie httpOnly
 *   3. handleLogout → `clear()` + localStorage wipe del wizard draft
 *
 * Out of scope de este fix (mantiene comportamiento actual):
 *   - Auto-refresh del token
 *   - Multi-session (un browser, múltiples tabs)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "../../features/auth/permissions";

export interface AuthUser {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
  photoURL?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Flag de "sesión revalidada contra server al mount". Mientras sea false,
   *  App muestra LoadingScreen. */
  hydrated: boolean;

  setUser: (user: AuthUser | null) => void;
  setLoading: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  clear: () => void;
}

const initialState = {
  user: null,
  loading: false,
  hydrated: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,
      setUser: (user) => set({ user }),
      setLoading: (loading) => set({ loading }),
      setHydrated: (hydrated) => set({ hydrated }),
      clear: () => set({ user: null, hydrated: true }),
    }),
    {
      name: "inmocontrol:auth:v1",
      // Solo persistir `user`; loading e hydrated son runtime-only.
      partialize: (s) => ({ user: s.user }),
    },
  ),
);

/** Selector fino (recomendado por AGENTS.md). */
export const selectUser = (s: AuthState) => s.user;
export const selectRole = (s: AuthState): Role | null => s.user?.role ?? null;