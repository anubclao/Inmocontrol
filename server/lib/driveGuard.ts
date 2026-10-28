/**
 * server/lib/driveGuard.ts — timeout, cancelación y reintentos para Google Drive.
 *
 * Por qué existe (auditoría Hostinger, oct-2026):
 *
 *  1. Seis endpoints de `routes/googleAuth.ts` llamaban a la API de Google sin
 *     timeout. Un cuelgue de Google o del refresh de token dejaba la request
 *     abierta hasta el `requestTimeout` de Node (300 s por defecto), con el
 *     socket y el buffer de la subida retenidos. Eso se ve como memoria y
 *     procesos ocupados.
 *
 *  2. Los `withTimeout()` de properties/inventories/tenants rechazan la
 *     promesa pero NO cancelan la request subyacente: el trabajo sigue
 *     corriendo en background. Si el usuario reintentaba, quedaban dos
 *     subidas en paralelo y —si la primera terminaba— el archivo quedaba
 *     duplicado en Drive.
 *
 *  3. No había backoff para 429/5xx. Un pico de cuota de Google se traducía
 *     en fallo definitivo para el usuario.
 *
 * Reglas de uso:
 *   - `runDrive()` recibe una THUNK que recibe el `AbortSignal`: la señal se
 *     pasa a googleapis (gaxios la soporta como `signal`), así que al vencer
 *     el timeout la request se aborta de verdad, no solo la promesa.
 *   - `attempts > 1` SOLO para operaciones idempotentes (list/get) o para
 *     escrituras que usan `upsertFileInFolder` (que evita duplicados).
 *   - Solo se reintentan 429, 5xx y errores de red transitorios. Un 400/404
 *     no se reintenta: reintentarlo es ruido y consume cuota.
 */

import { AppError } from "./errors.js";

/** Timeout por defecto de una llamada a Drive. Google responde en <2 s. */
export const DRIVE_TIMEOUT_MS = 15_000;

const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_NET_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EPIPE",
]);
/** Razones con las que Google devuelve 403 cuando se pasa de cuota. */
const RETRYABLE_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "backendError",
]);

function httpStatusOf(err: any): number {
  const raw = err?.response?.status ?? err?.status ?? err?.code;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function googleReasonOf(err: any): string | undefined {
  return (
    err?.response?.data?.error?.errors?.[0]?.reason ??
    err?.errors?.[0]?.reason ??
    undefined
  );
}

/** ¿Vale la pena reintentar este error de Google? */
export function isRetryableGoogleError(err: any): boolean {
  if (!err) return false;
  if (isAbortError(err)) return false; // nuestro propio timeout: ya se cortó
  if (RETRYABLE_HTTP.has(httpStatusOf(err))) return true;
  if (typeof err.code === "string" && RETRYABLE_NET_CODES.has(err.code)) return true;
  const reason = googleReasonOf(err);
  if (reason && RETRYABLE_REASONS.has(reason)) return true;
  return false;
}

function isAbortError(err: any): boolean {
  return err?.name === "AbortError" || err?.name === "CanceledError" || err?.code === "ERR_CANCELED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Timeout para promesas que NO aceptan un AbortSignal (ej: el refresh de
 * token de google-auth-library, que no recibe opciones).
 *
 * No cancela la request subyacente — no se puede desde afuera — pero evita
 * que la request HTTP del usuario quede esperando hasta el `requestTimeout`
 * de Node (300 s) y que las requests se apilen.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AppError(
            504,
            `Google no respondió en ${Math.round(ms / 1000)} s (${label}). Reintentá en unos segundos.`,
            "DRIVE_TIMEOUT",
            true,
          ),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function describe(err: any): string {
  return (
    googleReasonOf(err) ??
    err?.response?.status ??
    err?.code ??
    err?.message ??
    "error desconocido"
  );
}

export interface RunDriveOptions {
  /** Timeout por intento. Default 15 s. */
  timeoutMs?: number;
  /** Intentos totales. Default 1 (sin reintento). Máximo 4. */
  attempts?: number;
  /** Base del backoff exponencial. Default 300 ms → 300, 600, 1200. */
  backoffMs?: number;
}

/**
 * Ejecuta una llamada a Drive con timeout real (aborta la request) y, si se
 * pide, reintentos con backoff exponencial para 429/5xx/red.
 *
 * El timeout se traduce en un `AppError` 504 con mensaje accionable; el resto
 * de errores se re-lanzan tal cual para no romper los `catch` existentes
 * (varios handlers distinguen 404/403 de Google).
 */
/**
 * Nota de tipado: devuelve `any` a propósito. Todas las llamadas van contra
 * `drive: any` (googleapis sin genéricos acá), así que un `<T>` solo agrega
 * ruido de inferencia (`unknown`) sin ganar seguridad real.
 */
export async function runDrive(
  label: string,
  call: (signal: AbortSignal) => Promise<any>,
  opts: RunDriveOptions = {},
): Promise<any> {
  const timeoutMs = opts.timeoutMs ?? DRIVE_TIMEOUT_MS;
  const attempts = Math.min(4, Math.max(1, opts.attempts ?? 1));
  const backoffMs = opts.backoffMs ?? 300;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;

    // El timeout NO puede depender de que el callee respete la señal: si
    // googleapis ignorara el abort (o el thunk fuera uno que nunca resuelve),
    // `await call()` quedaría colgado para siempre. Por eso competimos la
    // llamada contra un rechazo propio y además abortamos la request.
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new AppError(
            504,
            `Google Drive no respondió en ${Math.round(timeoutMs / 1000)} s (${label}). Reintentá en unos segundos.`,
            "DRIVE_TIMEOUT",
            true,
          ),
        );
      }, timeoutMs);
    });

    try {
      // Promise.race engancha handlers a ambas promesas: si la llamada real
      // termina después del timeout, su resultado se descarta sin generar un
      // unhandledRejection.
      return await Promise.race([call(controller.signal), timeoutPromise]);
    } catch (err) {
      const timedOut = err instanceof AppError && err.code === "DRIVE_TIMEOUT";
      if (timedOut) {
        console.error(
          `[drive] timeout ${timeoutMs}ms en "${label}" (intento ${attempt}/${attempts}) — request abortada`,
        );
        throw err;
      }

      const isLast = attempt === attempts;
      if (isLast || !isRetryableGoogleError(err)) throw err;

      const delay = backoffMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      console.warn(
        `[drive] "${label}" falló (${describe(err)}). Reintento ${attempt}/${attempts - 1} en ${delay}ms`,
      );
      await sleep(delay);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Inalcanzable: el loop retorna o lanza.
  throw new AppError(500, "Internal server error", "DRIVE_UNREACHABLE", false);
}

/** Escapa un literal para la query de `files.list` (comillas simples). */
function escapeDriveQuery(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Busca un archivo por nombre exacto dentro de una carpeta. Devuelve el id o
 * `null`. Es idempotente → se ejecuta con reintentos.
 *
 * `kind` filtra por tipo para no confundir una carpeta con un archivo del
 * mismo nombre (pasa con nombres de propiedad que coinciden con un PDF).
 */
export async function findFileByName(
  drive: any,
  name: string,
  parentId: string,
  kind: "file" | "folder" | "any" = "any",
): Promise<string | null> {
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  const kindFilter =
    kind === "folder"
      ? ` and mimeType='${FOLDER_MIME}'`
      : kind === "file"
        ? ` and mimeType!='${FOLDER_MIME}'`
        : "";

  const res = await runDrive(
    "files.list (buscar por nombre)",
    (signal) =>
      drive.files.list(
        {
          q: `name='${escapeDriveQuery(name)}' and '${escapeDriveQuery(parentId)}' in parents and trashed=false${kindFilter}`,
          fields: "files(id, name, webViewLink)",
          spaces: "drive",
          pageSize: 1,
        },
        { signal },
      ),
    { attempts: 2 },
  );
  return res?.data?.files?.[0]?.id ?? null;
}

/**
 * Sube un archivo sin duplicar: si ya existe uno con ese nombre en la carpeta,
 * lo actualiza (reemplaza contenido) en vez de crear otro.
 *
 * Esto es lo que hace seguros los reintentos: un timeout que en realidad se
 * completó en Google no deja dos copias del PDF al reintentar.
 */
export async function upsertFileInFolder(
  drive: any,
  params: {
    name: string;
    parentId: string;
    mimeType: string;
    body: Buffer | NodeJS.ReadableStream;
  },
): Promise<{ id: string; webViewLink?: string; replaced: boolean }> {
  const { name, parentId, mimeType, body } = params;

  const existingId = await findFileByName(drive, name, parentId, "file");

  if (existingId) {
    const updated = await runDrive(
      `files.update (${name})`,
      (signal) =>
        drive.files.update(
          { fileId: existingId, media: { mimeType, body }, fields: "id, webViewLink" },
          { signal },
        ),
      { timeoutMs: 60_000 },
    );
    return {
      id: updated?.data?.id ?? existingId,
      webViewLink: updated?.data?.webViewLink ?? undefined,
      replaced: true,
    };
  }

  const created = await runDrive(
    `files.create (${name})`,
    (signal) =>
      drive.files.create(
        {
          requestBody: { name, parents: [parentId] },
          media: { mimeType, body },
          fields: "id, webViewLink",
        },
        { signal },
      ),
    { timeoutMs: 60_000 },
  );

  return {
    id: created?.data?.id,
    webViewLink: created?.data?.webViewLink ?? undefined,
    replaced: false,
  };
}

/**
 * Busca o crea una carpeta por nombre dentro de un padre.
 * Idempotente: la búsqueda se reintenta; la creación no (evita carpetas
 * duplicadas por reintentos).
 */
export async function findOrCreateFolder(
  drive: any,
  name: string,
  parentId: string,
): Promise<{ id: string; created: boolean }> {
  const existingId = await findFileByName(drive, name, parentId, "folder");
  if (existingId) return { id: existingId, created: false };

  const created = await runDrive(
    `files.create folder (${name})`,
    (signal) =>
      drive.files.create(
        {
          requestBody: {
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
          },
          fields: "id",
        },
        { signal },
      ),
  );
  return { id: created?.data?.id, created: true };
}
