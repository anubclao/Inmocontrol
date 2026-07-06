/**
 * Helpers compartidos para Google OAuth/Drive en el backend InmoControl.
 *
 * Los routes tienen su propio bloque "ensure fresh drive client" duplicado
 * (inventories.ts, properties.ts, tenants.ts, googleAuth.ts). Este módulo
 * centraliza la lógica común para no repetirla.
 */

/**
 * Helper para chequear si el access_token está próximo a expirar.
 *
 * Por qué existe: `oauth2Client.isTokenExpiring()` es protected en
 * `google-auth-library` y TS no nos deja llamarlo desde los routes. Como
 * tenemos `expiry_date` en la DB (Unix timestamp ms, schema.user_oauth_tokens),
 * comparamos manualmente con un threshold de 5 minutos (mismo default que
 * la lib de Google).
 *
 * @param expiryDate  Unix timestamp ms del expiration del access_token, o null/undefined
 * @returns true si el token expira en menos de 5 minutos (o ya expiró)
 */
export function isTokenExpiringSoon(expiryDate: number | null | undefined): boolean {
  if (!expiryDate) return true;
  const FIVE_MIN_MS = 5 * 60 * 1000;
  return expiryDate - Date.now() < FIVE_MIN_MS;
}