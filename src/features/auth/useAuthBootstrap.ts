/**
 * useAuthBootstrap — encapsula los 3 useEffect de auth + data layer
 * que estaban inline en App.tsx.
 *
 * 1. Hidratación inicial + check Drive status.
 * 2. Restore sesión vía /api/auth/me (cookie httpOnly).
 * 3. Re-hidratación post-login (cuando `user` pasa de null → !null).
 *
 * DEVUELVE `loading` que App usa para mostrar LoadingScreen solo en
 * el primer render.
 */
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../shared/store/authStore';
import { useAppStore } from '../../shared/store/appStore';
import { useGoogleDriveStore } from '../../shared/store/googleDriveStore';
import { STORAGE_KEYS } from '../../shared/hooks/storageKeys';
import type { Role } from '../auth/permissions';

const DEFAULT_USER = {
  uid: 'admin-local',
  displayName: 'Administrador Inmobiliario',
  email: 'admin@inmocontrol.com',
  role: 'admin' as const,
  photoURL:
    'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
};

export function useAuthBootstrap() {
  const [loading, setLoading] = useState(true);
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);

  // Hidratación inicial: DEFAULT_USER si no hay sesión persistida +
  // limpia localStorage legacy + carga datos de MySQL.
  useEffect(() => {
    if (!useAuthStore.getState().user) {
      setUser(DEFAULT_USER);
    }
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* silent */
      }
    });
    void useAppStore.getState().hydrate();
    void useGoogleDriveStore.getState().checkStatus();
    setLoading(false);
  }, [setUser]);

  // Re-hidratar cuando el user pasa de null → !null (post-login).
  useEffect(() => {
    if (user) {
      void useAppStore.getState().hydrate();
      void useGoogleDriveStore.getState().checkStatus();
    }
  }, [user]);

  // Restore sesión via cookie httpOnly si no hay user persistido.
  useEffect(() => {
    if (user) return; // ya hay user, no llamar al server
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser({
            uid: data.user.id,
            displayName: data.user.displayName,
            email: data.user.email,
            role: data.user.role as Role,
          });
        }
      })
      .catch(() => {
        /* silent */
      });
    // setUser es estable; ejecutamos solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading };
}