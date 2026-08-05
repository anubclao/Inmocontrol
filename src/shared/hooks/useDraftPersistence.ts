import { useEffect, useRef, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

/**
 * Hook de auto-save para wizards de InmoControl.
 *
 * Estrategia "híbrido" (spec fix_wizard_docs_persistence.md AC-2):
 *  1. Cualquier cambio en `value` se persiste a `localStorage` en <500ms
 *     (escritura síncrona inmediata — sobrevive cierre de tab/browser).
 *  2. Adicionalmente, cada `debounceMs` se hace un flush opcional a un
 *     backend (idempotente). El draft en MySQL = `signed_at IS NULL`.
 *
 * Por qué existe: el AGENTS.md tiene el TODO "Recuperación de wizard
 * interrumpido (PENDIENTE)" — este hook lo cierra sin nueva migración.
 *
 * Uso típico (en StepInventory):
 *   const { value, setValue, restoreValue, clear } = useDraftPersistence({
 *     key: `inventory:${propertyId}`,
 *     debouncedFlush: async (draft) => {
 *       await fetch(`/api/inventories`, { method: "POST", body: JSON.stringify(draft) });
 *     },
 *     onRestore: (draft) => showToast(`🔄 Avance restaurado — ${draft.updatedAt}`, "success"),
 *   });
 *
 * @param args.key         clave de localStorage (incluir propertyId para evitar colisión)
 * @param args.initialValue estado inicial si no hay draft guardado
 * @param args.debouncedFlush callback opcional para enviar el draft al server (idempotente)
 * @param args.debounceMs   default 5000ms (5s)
 * @param args.onRestore    se llama una vez al mount si había draft guardado
 * @param args.onClear      se llama después de `clear()` por si hay que mostrar toast
 */
export interface UseDraftPersistenceArgs<T> {
  key: string;
  initialValue: T;
  debouncedFlush?: (value: T) => Promise<void>;
  debounceMs?: number;
  onRestore?: (restored: T) => void;
  onClear?: () => void;
}

export interface DraftPersistenceHandle<T> {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  /** Llamar cuando el usuario finaliza el wizard exitosamente. */
  clear: () => void;
  /** Llamar cuando el usuario descarta el avance explícitamente. */
  discard: () => void;
}

export function useDraftPersistence<T>({
  key,
  initialValue,
  debouncedFlush,
  debounceMs = 5000,
  onRestore,
  onClear,
}: UseDraftPersistenceArgs<T>): DraftPersistenceHandle<T> {
  // 1. Storage inmediato (localStorage)
  const [value, setValueRaw] = useLocalStorage<T>(key, initialValue);

  // 2. Refs para no re-disparar el flush en cada render
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushedRef = useRef<string | null>(null);
  const isOnlineRef = useRef<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const onRestoreRef = useRef(onRestore);
  const onClearRef = useRef(onClear);

  // Mantener refs frescas sin re-crear el effect
  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);
  useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  // 3. Detectar online/offline (E4 del spec)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      isOnlineRef.current = true;
    };
    const handleOffline = () => {
      isOnlineRef.current = false;
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 4. Al mount: si hay draft (value !== initialValue), llamar onRestore
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    // Heurística: si el value guardado es "rico" (objeto con `updatedAt`),
    // disparamos onRestore. Si es exactamente el initialValue, no.
    const isInitial = JSON.stringify(value) === JSON.stringify(initialValue);
    if (!isInitial && onRestoreRef.current) {
      onRestoreRef.current(value);
    }
    hasRestoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 5. Wrapper de setValue: si el flush está configurado, debouncea un POST
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueRaw(next);
      if (!debouncedFlush) return;
      // Cancelar timer previo
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(async () => {
        if (!isOnlineRef.current) {
          console.warn(
            "[useDraftPersistence] Offline — flush pospuesto hasta volver online",
          );
          return;
        }
        // Calcular el value actual (puede haber cambiado durante el debounce)
        const current = next; // el último setValue ya quedó en localStorage
        const serialized = JSON.stringify(current);
        if (serialized === lastFlushedRef.current) return; // idempotente
        try {
          await debouncedFlush(current as T);
          lastFlushedRef.current = serialized;
        } catch (err) {
          console.warn("[useDraftPersistence] Flush failed:", err);
          // No throw — el draft queda en localStorage como red de seguridad
        }
      }, debounceMs);
    },
    [setValueRaw, debouncedFlush, debounceMs],
  );

  // 6. Clear = finalizar exitoso (borra localStorage, NO hace flush final)
  const clear = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    setValueRaw(initialValue);
    lastFlushedRef.current = null;
    if (onClearRef.current) onClearRef.current();
  }, [setValueRaw, initialValue]);

  // 7. Discard = mismo efecto, semánticamente distinto para el caller
  const discard = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    setValueRaw(initialValue);
    lastFlushedRef.current = null;
  }, [setValueRaw, initialValue]);

  // 8. Cleanup al unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  return { value, setValue, clear, discard };
}
