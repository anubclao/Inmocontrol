// filepath: src/shared/lib/apiClient.ts
// Cliente HTTP unificado para InmoControl.
//
// fix-issue-28 (FASE 4 Karpathy, oct-2026): reemplaza los 12 `fetch()` directos
// y los 3 clientes ad-hoc (billing/api.ts, saasBilling/api.ts, contractApi.ts)
// con UN solo helper que centraliza:
//   - timeout via fetchWithTimeout (15s default)
//   - parse JSON uniforme con manejo de 204 No Content
//   - shape de error tipado (ApiError con status/code/body)
//   - credentials: 'include' siempre (sesion httpOnly)
//
// Spec:    docs/specs/fix-issue-28-unified-api-client.md
// Verifier: tests/verifiers/fix-issue-28-unified-api-client.md
//
// Ejemplo de uso:
//   try {
//     const data = await apiRequest<User>('GET', '/api/auth/me');
//     setUser(data.user);
//   } catch (err) {
//     if (err instanceof ApiError && err.status === 401) clear();
//     else if (err instanceof ApiTimeoutError) console.warn('timeout');
//     else console.error('network error', err);
//   }

import { fetchWithTimeout, TimeoutError } from "./fetchWithTimeout";

/**
 * Error HTTP tipado. El backend (server/lib/errorHandler.ts) siempre
 * responde con shape `{ error, code }` (ver fix-issue-27). `body` trae
 * el body completo parseado para que el caller pueda leer campos extra
 * si los necesita.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `API error ${status} (${code})`);
    this.name = "ApiError";
  }
}

/**
 * Wrapper sobre `TimeoutError` de fetchWithTimeout. Permite que el caller
 * haga `if (err instanceof ApiTimeoutError)` para distinguir de otros
 * errores. Tambien es `instanceof TimeoutError` por herencia.
 */
export class ApiTimeoutError extends TimeoutError {
  constructor(url: string, timeoutMs: number) {
    super(url, timeoutMs);
    this.name = "ApiTimeoutError";
  }
}

export interface ApiRequestOptions {
  /** Timeout en ms. Default 15_000 (15 segundos). */
  timeoutMs?: number;
  /** AbortSignal externo para cancelacion desde el caller. */
  signal?: AbortSignal;
  /** Headers extra. Si hay body, Content-Type: application/json se agrega solo. */
  headers?: Record<string, string>;
}

/**
 * Hace HTTP al backend.
 *
 * - method: GET/POST/PUT/PATCH/DELETE
 * - path: ruta que empieza con `/api` o URL absoluta
 * - body: cualquier valor serializable a JSON (objeto, array, primitivo).
 *         Si es `undefined`, no se manda body ni Content-Type.
 *         Si es `null`, se serializa como `"null"`.
 * - options: timeoutMs, signal, headers extra
 *
 * Comportamiento:
 * - 2xx: devuelve el body parseado (JSON), o `undefined` si 204.
 * - 4xx/5xx: tira ApiError con status, code del backend, body completo.
 * - Network error: tira ApiError con status=0, code=NETWORK_ERROR.
 * - Timeout: tira ApiTimeoutError.
 * - Aborted por caller: tira ApiError con status=0, code=ABORTED.
 * - Body no es JSON: tira ApiError con code=INVALID_JSON_BODY.
 */
export async function apiRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `/api${path}`;
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(url, init, options.timeoutMs ?? 15_000);
  } catch (err) {
    if (err instanceof TimeoutError) {
      // Re-empaquetar como ApiTimeoutError (mantiene instanceof TimeoutError
      // por herencia, asi que callers viejos siguen funcionando).
      throw new ApiTimeoutError(err.url, err.timeoutMs);
    }
    if (
      err instanceof Error &&
      err.message === "fetch aborted by caller signal"
    ) {
      throw new ApiError(0, "ABORTED", undefined, err.message);
    }
    // Network error generico (DNS, ECONNREFUSED, server caido, etc).
    throw new ApiError(0, "NETWORK_ERROR", undefined, (err as Error).message);
  }

  // 204 No Content: no hay body, devolvemos undefined.
  if (res.status === 204) return undefined as T;

  // Parsear body (puede ser JSON valido, JSON malformado, o text plano).
  const text = await res.text();
  let parsed: unknown;
  if (text === "") {
    parsed = undefined;
  } else {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Body no es JSON. Si la response era ok, es un bug del backend
      // (deberia devolver JSON). Si era error, probablemente sea HTML
      // 500 default de Express.
      if (res.ok) {
        throw new ApiError(res.status, "INVALID_JSON_BODY", text);
      }
      throw new ApiError(res.status, "CLIENT_ERROR", text);
    }
  }

  if (!res.ok) {
    // El backend (fix-issue-27) siempre responde { error, code } en errores.
    // Fallback al code generico si el body no tiene code.
    const code =
      (parsed as { code?: string })?.code ??
      (res.status >= 500 ? "INTERNAL" : "CLIENT_ERROR");
    throw new ApiError(res.status, code, parsed);
  }

  return parsed as T;
}

// Re-exports para un solo punto de import.
export { fetchWithTimeout, TimeoutError };
