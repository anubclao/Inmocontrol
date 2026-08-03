// src/shared/lib/blob.ts
// Helpers para manejo de blob URLs en el browser.
//
// Por qué existe: `URL.createObjectURL(file)` crea un blob URL que apunta
// al File en memoria del browser. NO se libera automáticamente — hay que
// llamar a `URL.revokeObjectURL` cuando el blob ya no se necesita. Si no,
// después de muchos uploads (ej. wizard de propiedad con 10 PDFs), quedan
// 10+ blobs en RAM que solo se liberan al cerrar la pestaña.
//
// Patrón: usar SIEMPRE `revokeIfBlob(url)` antes de:
//   - Reemplazar un blob URL por otro (pisar el state con uno nuevo).
//   - Cerrar un modal/wizard que creó el blob.
//   - Desmontar un componente que tenía el blob.
//
// `revokeIfBlob` es seguro llamarlo con `null`/`undefined`/URL https
// (no-op en esos casos).

/**
 * Revoca un blob URL si es uno. No-op para null/undefined o URLs que no
 * son blob (e.g. `https://drive.google.com/...`).
 *
 * Llamar esto antes de:
 *   - Reemplazar un blob URL (ej. nuevo upload al mismo slot).
 *   - Cerrar un modal que creó el blob.
 *   - Cleanup de useEffect que creó el blob.
 */
export function revokeIfBlob(url: string | null | undefined): void {
  if (url && typeof url === "string" && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Crea un blob URL para un File. Pensado para usar en pares:
 *   const oldUrl = state.something;
 *   revokeIfBlob(oldUrl);
 *   const newUrl = createBlobUrl(file);
 *   setState({ something: newUrl });
 *
 * Equivale a `URL.createObjectURL(file)` — el helper existe solo para
 * centralizar el patrón y que sea fácil de auditar.
 */
export function createBlobUrl(file: File | Blob): string {
  return URL.createObjectURL(file);
}
