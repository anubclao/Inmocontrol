/**
 * server/lib/driveClient.ts — cliente de Google Drive POR REQUEST.
 *
 * Por qué existe (jul-2026, auditoría del módulo de inventarios):
 *
 *  1. Cada route (inventories, properties, tenants, googleAuth) tenía su propio
 *     `oauth2Client` creado a nivel de módulo. Ese objeto es un singleton
 *     compartido: si dos usuarios suben archivos a la vez, el segundo
 *     `setCredentials()` pisa al primero y la request en vuelo termina
 *     escribiendo en el Drive del OTRO usuario. Acá se crea un cliente nuevo
 *     por cada request → cero contaminación cruzada.
 *
 *  2. Todos los routes leían los tokens con `user_id = 'default_user'`
 *     hardcodeado, mientras el callback OAuth los guardaba con el email de
 *     Google (o `default_user`). Resultado: un usuario nuevo que conectaba su
 *     Gmail nunca quedaba "conectado" (su fila se ignoraba) y todos los
 *     usuarios de la instancia compartían un único Drive — el último que
 *     conectaba se quedaba con el de todos.
 *
 *     Ahora el `user_id` es el `profiles.id` de la sesión (`req.user.id`), con
 *     el email como segundo candidato (para tokens guardados por versiones
 *     previas) y `default_user` como último recurso legacy — este último
 *     desactivable con `DRIVE_LEGACY_FALLBACK=false` cuando toda la org ya
 *     migró a tokens por usuario.
 *
 *  3. El refresh de token se persistía sin `refresh_token`, y el callback
 *     escribía `refresh_token = VALUES(refresh_token)` — si Google no devolvía
 *     refresh_token en una reconexión, la fila quedaba en NULL y la conexión
 *     moría a la hora. Acá se usa `COALESCE` en ambos caminos.
 *
 * Regla: ningún route debe leer `user_oauth_tokens` a mano. Siempre por acá.
 */

import { google } from "googleapis";
import type { Request } from "express";
import crypto from "crypto";
import pool from "../db.js";
import { isTokenExpiringSoon } from "./googleAuth.js";

export const DRIVE_PROVIDER = "google_drive";

/** user_id legacy de la primera versión single-tenant de la app. */
export const LEGACY_DRIVE_USER_ID = "default_user";

/**
 * El fallback legacy se mantiene ON por default para no romper un deploy que
 * todavía tenga los tokens bajo `default_user`. Después de que cada usuario
 * reconectó su Gmail (y `GET /api/status/google-drive` ya no devuelve
 * `source: 'legacy'` para nadie), poner `DRIVE_LEGACY_FALLBACK=false` en el
 * panel de variables de entorno.
 */
function legacyFallbackEnabled(): boolean {
  return (process.env.DRIVE_LEGACY_FALLBACK ?? "true").toLowerCase() !== "false";
}

export interface DriveTokenRow {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  drive_folder_id: string | null;
}

export interface DriveContext {
  /** Cliente de Drive autenticado con el token de ESTA request. */
  drive: any;
  /** `user_id` de la fila de la que salieron los tokens (para re-persistir). */
  userId: string;
  /** Carpeta raíz "InmoControl" del Drive del usuario. */
  rootFolderId: string | null;
  /** `true` si los tokens vinieron del fallback `default_user`. */
  isLegacy: boolean;
}

/** IDs candidatos de token para el usuario de la request, en orden de prioridad. */
export function candidateDriveUserIds(req: Request): string[] {
  const user = (req as any)?.user as
    | { id?: string; email?: string }
    | undefined;
  const ids: string[] = [];
  if (user?.id) ids.push(String(user.id));
  if (user?.email) ids.push(String(user.email).trim().toLowerCase());
  if (legacyFallbackEnabled()) ids.push(LEGACY_DRIVE_USER_ID);
  // Dedup preservando orden.
  return Array.from(new Set(ids.filter(Boolean)));
}

function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

/** Busca la fila de tokens de mayor prioridad entre los candidatos. */
async function loadTokensForUserIds(
  userIds: string[],
): Promise<DriveTokenRow | null> {
  if (userIds.length === 0) return null;
  const placeholders = userIds.map(() => "?").join(",");
  const [rows] = await pool.query<any[]>(
    `SELECT user_id, access_token, refresh_token, expiry_date, drive_folder_id
       FROM user_oauth_tokens
      WHERE provider = ? AND user_id IN (${placeholders})`,
    [DRIVE_PROVIDER, ...userIds],
  );
  if (rows.length === 0) return null;
  for (const id of userIds) {
    const hit = rows.find((r) => r.user_id === id && r.access_token);
    if (hit) return hit as DriveTokenRow;
  }
  return null;
}

/**
 * Devuelve el contexto de Drive para la request, o `null` si el usuario no
 * tiene Drive conectado (o el refresh falló porque revocó el permiso).
 *
 * NUNCA lanza: el caller decide cómo degradar. Los errores de Drive se
 * loguean con el `user_id` para poder diagnosticar desde los logs del panel.
 */
export async function getDriveContext(
  req: Request,
): Promise<DriveContext | null> {
  const userIds = candidateDriveUserIds(req);
  let row: DriveTokenRow | null = null;
  try {
    row = await loadTokensForUserIds(userIds);
  } catch (err: any) {
    console.error("[drive] no se pudieron leer los tokens:", err?.message);
    return null;
  }
  if (!row) return null;

  const oauth2Client = newOAuthClient();
  oauth2Client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token ?? undefined,
    expiry_date: row.expiry_date ?? undefined,
  });

  if (isTokenExpiringSoon(row.expiry_date)) {
    // Sin refresh_token no hay forma de renovar: el usuario tiene que
    // reconectar. Lo decimos explícito en el log (antes moría en silencio).
    if (!row.refresh_token) {
      console.warn(
        `[drive] token expirado y sin refresh_token (user_id=${row.user_id}). Reconectar Drive.`,
      );
      return null;
    }
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await pool.query(
        `UPDATE user_oauth_tokens
            SET access_token  = ?,
                expiry_date   = ?,
                refresh_token = COALESCE(?, refresh_token)
          WHERE user_id = ? AND provider = ?`,
        [
          credentials.access_token ?? row.access_token,
          credentials.expiry_date ?? null,
          credentials.refresh_token ?? null,
          row.user_id,
          DRIVE_PROVIDER,
        ],
      );
    } catch (err: any) {
      console.warn(
        `[drive] refresh falló (user_id=${row.user_id}):`,
        err?.message,
      );
      return null;
    }
  }

  return {
    drive: google.drive({ version: "v3", auth: oauth2Client }),
    userId: row.user_id,
    rootFolderId: row.drive_folder_id,
    isLegacy: row.user_id === LEGACY_DRIVE_USER_ID,
  };
}

/** Atajo: solo el cliente de Drive (o `null`). Misma semántica que el viejo
 *  `getFreshDriveClient()` que estaba duplicado en cada route. */
export async function getDriveClientForRequest(req: Request): Promise<any | null> {
  const ctx = await getDriveContext(req);
  return ctx?.drive ?? null;
}

/** ¿Qué fila de tokens está usando la request? Útil para `/status`. */
export async function describeDriveConnection(req: Request): Promise<{
  connected: boolean;
  folderId: string | null;
  reason: "ok" | "legacy" | "no_token" | "no_expiry" | "expired" | "revoked";
  userId: string | null;
}> {
  const userIds = candidateDriveUserIds(req);
  let row: DriveTokenRow | null = null;
  try {
    row = await loadTokensForUserIds(userIds);
  } catch {
    return { connected: false, folderId: null, reason: "no_token", userId: null };
  }
  if (!row) {
    return { connected: false, folderId: null, reason: "no_token", userId: null };
  }
  const isLegacy = row.user_id === LEGACY_DRIVE_USER_ID;
  if (!row.drive_folder_id) {
    return {
      connected: false,
      folderId: null,
      reason: "no_token",
      userId: row.user_id,
    };
  }
  if (!row.expiry_date) {
    return {
      connected: false,
      folderId: row.drive_folder_id,
      reason: "no_expiry",
      userId: row.user_id,
    };
  }
  if (isTokenExpiringSoon(row.expiry_date)) {
    // Si hay refresh_token el próximo request lo renueva solo. Solo lo
    // reportamos como caído cuando NO hay forma de renovar.
    if (!row.refresh_token) {
      return {
        connected: false,
        folderId: row.drive_folder_id,
        reason: "expired",
        userId: row.user_id,
      };
    }
  }
  return {
    connected: true,
    folderId: row.drive_folder_id,
    reason: isLegacy ? "legacy" : "ok",
    userId: row.user_id,
  };
}

/** Guarda/actualiza los tokens del usuario que acaba de autorizar la app. */
export async function saveDriveTokens(params: {
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: number | null;
  driveFolderId?: string | null;
  scopes?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO user_oauth_tokens
       (id, user_id, provider, access_token, refresh_token, expiry_date, drive_folder_id, scopes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       access_token    = VALUES(access_token),
       -- COALESCE: una reconexión sin refresh_token NO debe borrar el que ya
       -- teníamos, o la conexión muere cuando expire el access_token.
       refresh_token   = COALESCE(VALUES(refresh_token), refresh_token),
       expiry_date     = VALUES(expiry_date),
       drive_folder_id = COALESCE(VALUES(drive_folder_id), drive_folder_id),
       scopes          = COALESCE(VALUES(scopes), scopes),
       updated_at      = CURRENT_TIMESTAMP`,
    [
      crypto.randomUUID(),
      params.userId,
      DRIVE_PROVIDER,
      params.accessToken,
      params.refreshToken ?? null,
      params.expiryDate ?? null,
      params.driveFolderId ?? null,
      params.scopes ?? null,
    ],
  );
}

/** Borra los tokens de Drive de los IDs dados (usado por "Desconectar"). */
export async function deleteDriveTokens(userIds: string[]): Promise<number> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const [result] = await pool.query<any>(
    `DELETE FROM user_oauth_tokens WHERE provider = ? AND user_id IN (${placeholders})`,
    [DRIVE_PROVIDER, ...ids],
  );
  return result?.affectedRows ?? 0;
}
