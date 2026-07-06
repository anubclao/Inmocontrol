import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Hook genérico sobre localStorage, con SSR-safe fallback y sync entre pestañas.
 *
 * Por qué existe: el monolito actual hace `localStorage.getItem` + `setItem`
 * a mano en 13 sitios distintos. Centralizar evita drift y permite migrar a
 * Zustand sin reescribir cada vista.
 *
 * Uso:
 *   const [properties, setProperties] = useLocalStorage<Property[]>('properties', []);
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch (err) {
      console.warn(`[useLocalStorage] Failed to read "${key}":`, err);
      return initialValue;
    }
  });

  // Sync entre pestañas: si otra ventana cambia el mismo key, lo reflejamos.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = next instanceof Function ? next(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch (err) {
          console.warn(`[useLocalStorage] Failed to write "${key}":`, err);
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}

/**
 * Toast efímero para feedback de UI. API mínima para no atar a librerías.
 *
 *   const { toasts, showToast, dismiss } = useToasts();
 *   showToast('Propiedad guardada', 'success');
 */
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  ttlMs: number;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: Toast['type'] = 'info', ttlMs = 3500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, type, ttlMs }]);
      timers.current[id] = setTimeout(() => dismiss(id), ttlMs);
    },
    [dismiss]
  );

  useEffect(() => {
    const refs = timers.current;
    return () => {
      Object.values(refs).forEach(clearTimeout);
    };
  }, []);

  return { toasts, showToast, dismiss };
}
