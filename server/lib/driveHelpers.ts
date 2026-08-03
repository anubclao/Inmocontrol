// server/lib/driveHelpers.ts
// Helpers para Google Drive API.
//
// Por qué existe: la API de Drive usa queries con strings entre comillas
// simples (`name='foo' and mimeType='folder'`). Si el valor contiene una
// comilla simple sin escapar, la query rompe (SyntaxError del lado de Google)
// y — peor — abre la puerta a injection de operadores (`or`, `and`, etc.).
//
// Patrón: escapar `\` primero, después `'`. El orden importa (si escapás
// `'` primero, los `\\` introducidos en el segundo paso también se escaparían
// doble).
//
// Referencia: BUG-010 (este archivo fue creado para unificar el escape que
// properties.ts hacía a mano y tenants.ts hacía mal).

/**
 * Escapa un valor para usarlo en una query de Drive (`drive.files.list`).
 *
 * - `null` / `undefined` → `''` (no rompe, busca carpetas con nombre vacío).
 * - Objetos / arrays → `String(obj)` → `'[object Object]'` (defensivo, no crash).
 * - `"O'Brien"` → `"O\'Brien"`.
 * - `"Calle\\test"` → `"Calle\\\\test"`.
 */
export function escapeDriveQueryValue(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}
