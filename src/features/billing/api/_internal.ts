// filepath: src/features/billing/api/_internal.ts
/**
 * Infraestructura compartida del cliente de billing:
 *   - Detección de modo (backend vs localStorage)
 *   - Wrapper de fetch con timeout
 *   - Helper de fallback: devuelve FallbackResult<T> con source + reason
 *
 * Los 13 archivos de dominio (policiesApi, amortizationApi, etc) importan
 * de acá. NO exportar desde acá fuera de `api/`.
 */
import { apiRequest } from "../../../shared/lib/apiClient";

export type Mode = "backend" | "local";

let currentMode: Mode = "local"; // default conservador; /api/health lo cambia a 'backend' si responde
let modeDetected = false;

export async function detectMode(): Promise<Mode> {
  if (modeDetected) return currentMode;
  modeDetected = true;
  try {
    const r = await fetch("/api/health", { method: "GET" });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j?.db?.ok) {
        currentMode = "backend";
        console.info("[billing/api] Backend MySQL detectado. Usando fetch.");
        return "backend";
      }
    }
  } catch {
    // silent
  }
  console.info("[billing/api] Backend no disponible. Usando localStorage.");
  return currentMode;
}

/**
 * Wrapper de fetch con detección de modo. Si el modo es "local", tira error
 * para que el caller caiga al fallback. Si es "backend", usa el apiRequest
 * compartido con timeout.
 */
export async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: any,
): Promise<T> {
  const mode = await detectMode();
  if (mode === "local") {
    throw new Error("backend unavailable");
  }
  return apiRequest<T>(method, path, body);
}

/**
 * BUG-025: el helper original devolvía silenciosamente el fallback si el
 * server fallaba. El caller mostraba toast de éxito → user pensaba que
 * guardó en MySQL cuando en realidad quedó solo en localStorage.
 * Nuevo contrato: devuelve { source, value, reason } para que el caller
 * pueda decidir qué mostrar.
 */
export type FallbackResult<T> =
  | { source: "backend"; value: T }
  | { source: "fallback"; value: T; reason: string };

export async function tryBackendOrFallback<T>(
  backendCall: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<FallbackResult<T>> {
  const mode = await detectMode();
  if (mode === "local") {
    return {
      source: "fallback",
      value: await fallback(),
      reason: "local mode (no backend detected)",
    };
  }
  try {
    const value = await backendCall();
    return { source: "backend", value };
  } catch (err: any) {
    console.warn("[billing/api] backend falló, usando fallback local:", err);
    return {
      source: "fallback",
      value: await fallback(),
      reason: err?.message ?? String(err),
    };
  }
}

/** Helper sugar: extrae `result.value` automáticamente. Para callers
 * que NO necesitan distinguir entre backend OK y fallback silencioso. */
export async function tryBackendOrFallbackValue<T>(
  backendCall: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  const r = await tryBackendOrFallback(backendCall, fallback);
  return r.value;
}

/** Acceso al mode actual (sin async). Para diagnóstico. */
export function getCurrentMode(): Mode {
  return currentMode;
}

/** Resetea el cache de mode. Llamado por apiModeApi.resetApiMode(). */
export function resetModeCache(): void {
  modeDetected = false;
  currentMode = "local";
}
