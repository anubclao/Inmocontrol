/**
 * useSessionTimeout — logout automático por inactividad.
 *
 * Eventos que reinician el contador: mousedown, mousemove, keypress,
 * scroll, touchstart. Default 8 horas (un día de trabajo completo).
 * Antes era 15 min, muy agresivo (sacaba al user del wizard a mitad
 * de inventario si se distraía).
 *
 * Spec #app-refactor AC-4.
 */
import { useEffect, useRef } from 'react';

export const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

const IDLE_EVENTS = [
  'mousedown',
  'mousemove',
  'keypress',
  'scroll',
  'touchstart',
] as const;

export function useSessionTimeout(opts: {
  enabled: boolean;
  onTimeout: () => void;
}) {
  const { enabled, onTimeout } = opts;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handler = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onTimeout();
      }, SESSION_TIMEOUT_MS);
    };

    IDLE_EVENTS.forEach((event) => window.addEventListener(event, handler));
    handler(); // arranca el contador inicial

    return () => {
      IDLE_EVENTS.forEach((event) =>
        window.removeEventListener(event, handler),
      );
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, onTimeout]);
}