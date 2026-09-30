# Fix #28: Cliente HTTP unificado (apiClient) en el frontend

> **Severidad**: 🟡 P2 (refactor arquitectónico).
> **Stack**: `src/shared/lib/`, React 19 + Vite 6.
> **Esfuerzo**: ~1.5h. Spec + 1 archivo nuevo + 2 migraciones.
> **Status**: ⏳ Pending Review (Karpathy FASE 2 — no tocar código hasta aprobación).

## 1. User Story

**As a** desarrollador de InmoControl,
**I want to** tener UN solo helper (`apiClient`) para hacer HTTP al backend con timeout, parse JSON uniforme y shape `ApiError` consistente,
**So that** (a) no haya 3 clientes ad-hoc duplicados (billing/api.ts, saasBilling/api.ts, contractApi.ts), (b) el manejo de timeouts sea uniforme (no más 5 min de espera del browser), y (c) agregar features nuevas sea mecánico (un import, no 30 líneas de boilerplate).

## 2. Estado actual (lo que está MAL)

**Inventario confirmado** (12 `fetch()` directos en 10 archivos):

| Archivo | Función/usos | Patrón actual |
|---|---|---|
| `src/features/auth/useAuthBootstrap.ts:58` | `/api/auth/me` (1 vez) | `fetch()` directo, sin timeout, sin parse |
| `src/features/billing/api.ts:57, 78` | `api<T>()` local (10+ usos) | Helper local con `api<T>(method, path, body)`, sin timeout, shape inconsistente |
| `src/features/contracts/contractApi.ts:25` | contratos (1+ usos) | `fetch()` directo, sin timeout |
| `src/features/saasBilling/api.ts:30` | subscripciones (1+ usos) | `fetch()` directo, sin timeout |
| `src/features/alerts/channels.ts:88, 121` | Twilio/email (2 usos) | `fetch()` directo, sin timeout |
| `src/features/shell/useCrudHandlers.ts:50` | CRUD genérico (1 uso) | `fetch()` directo |
| `src/shared/hooks/useDraftPersistence.ts:20` | POST de drafts (1 uso) | `fetchWithTimeout` (sí) |
| `src/shared/lib/fetchWithTimeout.ts:31, 65` | helper base (lo reusa) | **ya existe**, bien hecho |
| `src/shared/store/googleDriveStore.ts:40` | `/api/drive/*` (1+ usos) | `fetch()` directo |

**3 problemas concretos**:

1. **3 clientes ad-hoc**: `billing/api.ts:api<T>()`, `saasBilling/api.ts:?`, `contractApi.ts:?` reimplementan el mismo patrón (timeout? no, parse JSON? sí, manejo 4xx/5xx? inconsistente).
2. **9 de 12 `fetch()` sin timeout**: si MySQL está saturado o el server cuelga, el browser espera hasta ~5 min y la UI queda "congelada". El `TimeoutError` que ya tenés en `fetchWithTimeout.ts` no se usa en esos 9 sitios.
3. **Shape de error inconsistente**: `billing/api.ts:78` tira `throw new Error("HTTP ${r.status}: ${text}")` (concatena el body del error como string). `useAuthBootstrap.ts:67` no loguea nada. Imposible hacer `if (err instanceof ApiError && err.code === "INTERNAL")` desde el frontend.

## 3. Aceptación

### AC-1: Helper `apiClient` en `src/shared/lib/apiClient.ts`

- Nuevo archivo `src/shared/lib/apiClient.ts` exporta:
  - `class ApiError extends Error` con `status: number`, `code: string`, `body: unknown`.
  - `class ApiTimeoutError extends TimeoutError` (extiende el existente para que `err instanceof TimeoutError` siga funcionando).
  - Función `apiRequest<T>(method, path, body?, options?)` que:
    - Usa `fetchWithTimeout` (15s default, overridable).
    - Parsea JSON automático.
    - Si `response.ok === false`, lee el body (JSON o text) y tira `ApiError` con `status`/`code`/`body`.
    - Si `response.status === 204`, devuelve `undefined as T`.
    - Headers default: `Content-Type: application/json` cuando hay body.
    - `credentials: 'include'` siempre (porque la sesión es httpOnly cookie — ver FASE 4 cuando se enchufe auth).
- **Re-exporta** `TimeoutError` y `fetchWithTimeout` desde el archivo (no mover el código, solo re-exportar para un solo punto de import).

### AC-2: Tipos explícitos

```typescript
// src/shared/lib/apiClient.ts

export interface ApiRequestOptions {
  timeoutMs?: number;        // default 15_000
  signal?: AbortSignal;      // propagado a fetchWithTimeout
  headers?: Record<string, string>;
  // sin credentials: 'include' option — siempre va
}

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

export class ApiTimeoutError extends TimeoutError {
  constructor(url: string, timeoutMs: number) {
    super(url, timeoutMs);
    this.name = "ApiTimeoutError";
  }
}

export async function apiRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<T>;
```

### AC-3: Migrar `useAuthBootstrap.ts` (1 fetch → apiRequest)

- El `fetch("/api/auth/me", { credentials: "include" })` se reemplaza por `apiRequest<User>('GET', '/api/auth/me')`.
- Si la respuesta es 401, **el `ApiError` tiene `status: 401` y `code: "CLIENT_ERROR"`** (default del backend para no-2xx). El caller hace `if (err instanceof ApiError && err.status === 401) { clear() }`.
- No se loguea el error de red (silent fail como hoy).
- **Sin cambio funcional** observable: el `useAuthStore.getState().clear()` se sigue llamando en el catch.

### AC-4: Migrar `billing/api.ts` (helper `api<T>` → `apiRequest<T>`)

- El helper local `api<T>(method, path, body?)` en `billing/api.ts:55-78` se BORRA y se reexporta desde `apiClient`.
- Los 10+ callers que usan `api<T>(...)` siguen funcionando sin cambios (mismo contrato).
- El `detectMode()` se mantiene (es lógica de billing, no de HTTP).
- El manejo de `r.status === 204` ahora viene del `apiRequest` (no hay que duplicarlo).

### AC-5: Tests E2E (verifier) escrito y validado

- `tests/verifiers/fix-issue-28-unified-api-client.md` creado con checklist binario.
- AC-1, AC-3, AC-4 tienen 1+ paso cada uno.
- **Antes de tocar código**: el verifier corre contra el estado actual y reporta AC-1 = FAIL (`apiClient.ts` no existe). Eso es esperado.

## 4. Out of Scope (explícito)

Este spec **NO** cubre:

- ❌ Migrar los otros 10 archivos (saasBilling/api, contractApi, channels, useCrudHandlers, useDraftPersistence, googleDriveStore, alerts/channels). Cada uno es un spec aparte (`fix-issue-29-...`, `fix-issue-30-...`).
- ❌ Auth interceptor (Bearer header o refresh de sesión). Hoy la sesión es httpOnly cookie — no se necesita header. Si en el futuro se migra a JWT, va en su propio spec.
- ❌ Retry policy (backoff exponencial). Los errores 5xx se loguean y se propagan al caller. Si un caller quiere retry, lo hace manualmente.
- ❌ Cache de respuestas (SWR / react-query). Out of scope.
- ❌ Cambios en el backend. El `apiClient` solo consume; el backend ya devuelve JSON uniforme (ver fix-issue-27).
- ❌ Tests unitarios (Vitest no instalado per AGENTS.md). Solo verifier E2E manual.

## 5. Edge Cases

### E-1: Backend devuelve HTML (caso pre-fix-issue-27)
- `apiRequest` intenta `await res.json()`. Si el body no es JSON válido, **catch** del JSON parse y devuelve `ApiError` con `code: "INVALID_JSON_BODY"`, `status: 200` (porque `res.ok` es true), `body: "<raw html>"`.
- **Decisión**: `apiRequest` debe hacer un `try { JSON.parse } catch` antes de confiar en el body. Si falla, igual devuelve el body como text pero con `code: "INVALID_JSON_BODY"`. El caller puede decidir qué hacer.

### E-2: Network error (no hay server, ECONNREFUSED, server caído)
- `fetchWithTimeout` tira `Error` nativo (no `TimeoutError` porque el abort no se disparó). `apiRequest` lo envuelve en `ApiError` con `status: 0`, `code: "NETWORK_ERROR"`, `body: undefined`.

### E-3: 204 No Content
- `apiRequest` devuelve `undefined as T` (mismo shape que ya tenía `billing/api.ts`).

### E-4: Body es `null` o `undefined`
- Si `body` es `undefined`, NO se manda header `Content-Type` ni se serializa.
- Si `body` es `null`, sí se manda `Content-Type: application/json` con body `"null"`.

### E-5: Timeout del caller (`AbortSignal` externo)
- `apiRequest` propaga el `signal` a `fetchWithTimeout`. Si el caller aborta, `fetchWithTimeout` tira `Error("fetch aborted by caller signal")` que `apiRequest` envuelve en `ApiError(code: "ABORTED")`.

## 6. Technical Contract

### `src/shared/lib/apiClient.ts` — sketch

```typescript
import { fetchWithTimeout, TimeoutError } from "./fetchWithTimeout";

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

export class ApiTimeoutError extends TimeoutError {
  constructor(url: string, timeoutMs: number) {
    super(url, timeoutMs);
    this.name = "ApiTimeoutError";
  }
}

export interface ApiRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

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
    if (err instanceof TimeoutError) throw new ApiTimeoutError(err.url, err.timeoutMs);
    // Network error o aborted
    if (err instanceof Error && err.message === "fetch aborted by caller signal") {
      throw new ApiError(0, "ABORTED", undefined, err.message);
    }
    throw new ApiError(0, "NETWORK_ERROR", undefined, (err as Error).message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  // Parse JSON body
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    // Body no es JSON
    if (res.ok) {
      throw new ApiError(res.status, "INVALID_JSON_BODY", text);
    }
    throw new ApiError(res.status, "CLIENT_ERROR", text);
  }

  if (!res.ok) {
    const code = (parsed as any)?.code ?? (res.status >= 500 ? "INTERNAL" : "CLIENT_ERROR");
    throw new ApiError(res.status, code, parsed);
  }

  return parsed as T;
}

// Re-exports para un solo punto de import
export { fetchWithTimeout, TimeoutError };
```

### Caller pattern (ejemplo)

```typescript
// ANTES (useAuthBootstrap.ts:58):
fetch("/api/auth/me", { credentials: "include" })
  .then(async (res) => {
    if (res.ok) { ... }
    else { clear() }
  })
  .catch(() => clear());

// DESPUÉS:
apiRequest<{ user: { id: string; displayName: string; email: string; role: string } }>("GET", "/api/auth/me")
  .then((data) => { setUser({...}) })
  .catch((err) => {
    if (err instanceof ApiError && err.status === 401) {
      useAuthStore.getState().clear();
    } else {
      // network error, timeout, etc.
      useAuthStore.getState().clear();
    }
  });
```

## 7. Timeouts explícitos

- **Default**: 15 segundos (igual que `fetchWithTimeout`).
- **Override**: `apiRequest("GET", "/health", undefined, { timeoutMs: 5_000 })`.
- **Health checks**: si un caller quiere chequear `/api/health` con timeout corto (3s), lo pide explícitamente. No hay un timeout especial.

## 8. Tostadas exactas (copy approved)

> **Este spec NO agrega toasts nuevos**. Solo cambia cómo se hace el HTTP. Los toasts que ya existen (ver `src/shared/hooks/useToasts.ts`) siguen funcionando igual.

## 9. Dependencias

### Archivos a crear
- `src/shared/lib/apiClient.ts` (nuevo, ~80 líneas)

### Archivos a modificar
- `src/features/auth/useAuthBootstrap.ts` (~10 líneas modificadas: el fetch directo → apiRequest)
- `src/features/billing/api.ts` (~20 líneas: borrar helper local, importar apiRequest)

### Archivos a NO tocar (out of scope)
- `src/shared/lib/fetchWithTimeout.ts` (se re-exporta, no se modifica)
- `src/features/saasBilling/api.ts` (spec aparte: fix-issue-29)
- `src/features/contracts/contractApi.ts` (spec aparte: fix-issue-29)
- `src/features/alerts/channels.ts` (spec aparte: fix-issue-30)
- `src/features/shell/useCrudHandlers.ts` (spec aparte: fix-issue-30)
- `src/shared/hooks/useDraftPersistence.ts` (ya usa fetchWithTimeout, no urgente)
- `src/shared/store/googleDriveStore.ts` (spec aparte: fix-issue-31 — Drive endpoints tienen shape particular)

## 10. Riesgos identificados

- **R1**: Si `useAuthBootstrap` rompe, el user queda sin login al cargar la app (worst case). **Mitigación**: el smoke test runtime (Levantar server + verificar que /api/auth/me responde). El catch de error sigue llamando `clear()`.
- **R2**: Si `billing/api.ts` rompe, todos los flujos de billing quedan rotos. **Mitigación**: el helper local se BORRA pero el contrato `api<T>(method, path, body)` se mantiene vía re-export. Mismo comportamiento.
- **R3**: El `apiRequest` agrega ~1 KB al bundle. **Mitigación**: aceptable (es 1 helper, no 10).

## 11. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]

---

## Anexo: comandos de auditoría para correr ANTES de implementar

```powershell
# Confirmar el inventario actual
$count = (Get-ChildItem "src" -Recurse -Filter "*.ts" | Select-String -Pattern "fetch\(" | Measure-Object -Line).Lines
# Esperado: 12 (al momento de escribir este spec)

# Confirmar que apiClient.ts NO existe
Test-Path "src\shared\lib\apiClient.ts"
# Esperado: False
```
