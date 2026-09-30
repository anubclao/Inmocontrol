/**
 * Helpers para clasificación de URLs de archivos.
 *
 * FIX #25: centraliza la detección de URLs locales (no persistibles en DB)
 * vs URLs de Drive (persistibles). Antes había 6+ comparaciones inline
 * `url.startsWith("blob:") || url.startsWith("/api/")` esparcidas por el
 * código, cada una con su propia variante. Riesgo de drift entre ellas.
 *
 * Reglas:
 * - `blob:` o `data:` → local (mueren al refrescar)
 * - ruta local `/api/...` → local (proxy server-side, no compartible cross-device)
 * - `https://drive.google.com/...` o `https://docs.google.com/...` → Drive
 * - `https://lh*.googleusercontent.com/...` → Drive (thumbnails)
 * - cualquier otra cosa → "unknown" (decisión del caller)
 */
export type FileUrlKind = "local" | "drive" | "unknown";

/** Determina si una URL es local (no persistible en MySQL/Drive). */
export function isLocalFileUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null/undefined = "no subido"
  if (url.startsWith("blob:")) return true;
  if (url.startsWith("data:")) return true;
  if (url.startsWith("/api/")) return true; // proxy local
  return false;
}

/** Clasifica una URL de archivo. Útil para UI badges. */
export function classifyFileUrl(url: string | null | undefined): FileUrlKind {
  if (isLocalFileUrl(url)) return "local";
  // FIX #18 (centralizado): comparar solo el path antes de query params
  const pathOnly = (url ?? "").split("?")[0];
  if (/^https:\/\/(drive|docs)\.google\.com\//.test(pathOnly)) return "drive";
  if (/^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(pathOnly))
    return "drive";
  return "unknown";
}