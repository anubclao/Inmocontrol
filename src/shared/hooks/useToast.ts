/**
 * useToast — hook de toast con auto-dismiss.
 *
 * Mantiene el contrato legacy: copy + tipo, y TTL distinto para
 * warnings (5s) vs success/error (3s). Es lo que se usaba inline en
 * App.tsx — solo lo extraemos a un hook reutilizable.
 */
import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning';

export interface ToastState {
  message: string;
  type: ToastType;
}

const DEFAULT_TTL_MS = 3000;
const WARNING_TTL_MS = 5000;

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      setToast({ message, type });
      const ttl = type === 'warning' ? WARNING_TTL_MS : DEFAULT_TTL_MS;
      window.setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, ttl);
    },
    [],
  );

  return { toast, showToast };
}