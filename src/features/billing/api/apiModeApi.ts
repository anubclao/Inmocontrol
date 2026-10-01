// filepath: src/features/billing/api/apiModeApi.ts
// ─── API Mode helpers ─────────────────────────────────────────────────

import { api, getCurrentMode, resetModeCache } from "./_internal";

/**
 * Sync de entidades base (properties/contracts/tenants). Llamado al iniciar
 * la app para que la DB tenga las FK resueltas. No-op en local mode.
 */
export async function syncEntities(payload: {
  organizations?: any[];
  properties?: any[];
  tenants?: any[];
  contracts?: any[];
}): Promise<void> {
  try {
    await api("POST", "/entities/sync", payload);
  } catch (err) {
    console.warn("[billing/api] syncEntities falló:", err);
  }
}

/** Fuerza re-detección del modo (útil tras login o settings change). */
export function resetApiMode(): void {
  resetModeCache();
}

/** Devuelve el modo actual ('backend' | 'local') sin async. */
export function getApiMode(): "backend" | "local" {
  return getCurrentMode();
}
