# Fix #27: Manejo unificado de errores en el backend

> **Severidad**: 🟠 P1 (seguridad/arquitectura).
> **Stack**: `server/routes/*.ts` + `server/lib/errorHandler.ts` (ya existe).
> **Esfuerzo**: ~3h. 17 sitios a refactorizar en 6 archivos.
> **Status**: ⏳ Pending Review (Karpathy FASE 2 — no tocar código hasta aprobación).

## 1. User Story

**As a** operador de InmoControl (agente o admin),
**I want to** que CUALQUIER error de cualquier endpoint devuelva un JSON consistente con shape `{ error, code }` y mensaje que NO leak de internals (SQL, stack, paths de DB),
**So that** (a) el frontend nunca vea HTML o JSON malformado que tire `SyntaxError`, (b) la info sensible del server no termine en manos de un atacante, y (c) los logs de error sean uniformes para debug.

## 2. Estado actual (lo que está MAL)

**Inventario confirmado** (17 sitios, 6 archivos):

| Archivo                          | Líneas                       | Patrón actual                                                        |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `server/routes/properties.ts`    | 294, 463, 537, 672, 731, 849 | Try/catch + `res.status(500).json({ error: ... })`                   |
| `server/routes/tenants.ts`       | 395, 947                     | Try/catch + `res.status(500).json({ error: ... })`                   |
| `server/routes/saasBilling.ts`   | 157, 224                     | `return res.status(500).json(...)` inline                            |
| `server/routes/notifications.ts` | 147, 171, 348, 391           | `res.status(500).json({ error: err.message, code: err.code })`       |
| `server/routes/admin.ts`         | 61, 89                       | `res.status(500).json({ ok: false, error, code, sql })`              |
| `server/routes/auth.ts`          | 215                          | `res.status(500).json({ error: "Error interno", code: "INTERNAL" })` |

**3 problemas concretos**:

1. **Mensajes filtran internals** (líneas 294, 463, 849 de properties.ts, 395 y 947 de tenants.ts, todas las de notifications.ts): el `error` se construye con `err.message` o `err.message + sql`, exponiendo al cliente:
   - Queries SQL rotas
   - Nombres de columnas faltantes (`Unknown column 'X'`)
   - Stack traces parciales
   - Mensajes de MySQL con paths internos

2. **Shape inconsistente**:
   - Algunos sitios: `{ error, code }` (errorHandler-friendly)
   - Algunos: `{ error, code, sql, mysqlCode }` (admin.ts, **peor**)
   - Algunos: `{ ok: false, error, code, messageId? }` (notifications)
   - Algunos: `{ error, hint }` (properties.ts 672, 731)

3. **Bypass del `errorHandler` central**: cuando un handler hace `res.status(500).json(...)` en vez de `next(err)`, el `errorHandler` no corre, así que:
   - No se loguea con el formato uniforme `[errorHandler] METHOD /path:`
   - No se aplica la lógica de `expose` (mensaje genérico para 5xx)
   - No se cachea el caso `headersSent`

## 3. Aceptación

### AC-1: Cero `res.status(500)` en `server/routes/*.ts`

- `grep -rn "res\.status(500)" server/routes/` retorna **0 resultados**.
- Los 17 sitios refactorizados usan `next(err)` o `throw new AppError(...)` (ver AC-2).

### AC-2: Helper `AppError` + `HttpError` en `server/lib/errors.ts`

- Nuevo archivo `server/lib/errors.ts` exporta:
  - `class AppError extends Error { statusCode: number; code: string; expose: boolean; }`
  - `class HttpError extends AppError` con factories: `badRequest(msg, code?)`, `unauthorized(msg, code?)`, `forbidden(msg, code?)`, `notFound(msg, code?)`, `conflict(msg, code?)`, `internal(msg, code?)`, `serviceUnavailable(msg, code?)`.
- Default de `expose`:
  - 4xx (`< 500`): `expose = true` (el caller quiere que el cliente vea el mensaje).
  - 5xx (`>= 500`): `expose = false` (mensaje genérico, ver AC-3).
- Exporta `asyncHandler` ya existente (re-export desde `server/lib/asyncHandler.ts` para un solo punto de import).

### AC-3: `errorHandler` decide si exponer o no

- El `errorHandler` actual (en `server/lib/errorHandler.ts`) ya tiene la lógica de `expose`. Sin cambios funcionales, salvo:
  - Aceptar errores de clase `AppError` (con `statusCode`, `code`, `expose`).
  - Si el error NO es `AppError` (raw `Error`): `statusCode = 500`, `expose = false`, loguear con stack completo.
- Shape de respuesta para 5xx con `expose = false`:
  ```json
  { "error": "Internal server error", "code": "INTERNAL" }
  ```
- Shape de respuesta para 4xx (o 5xx con `expose = true`):
  ```json
  { "error": "<mensaje del caller>", "code": "<code del caller>" }
  ```

### AC-4: 17 sitios refactorizados con patrón uniforme

Cada sitio se refactoriza a UNO de estos 2 patrones:

**Patrón A — Error conocido** (4xx con mensaje custom):

```typescript
// Antes:
res.status(400).json({ error: "Falta campo X", code: "MISSING_X" });
// Después:
throw badRequest("Falta campo X", "MISSING_X");
```

**Patrón B — Error inesperado** (5xx):

```typescript
// Antes:
} catch (err: any) {
  console.error("[POST /api/X] UNHANDLED:", err.message);
  res.status(500).json({ error: "Error inesperado: " + err.message });
}
// Después:
} catch (err) {
  // No loguear acá: errorHandler lo loguea con stack
  throw err;   // ← asyncHandler lo catchea y llama next(err)
}
```

O si el handler NO es `asyncHandler`, agregar `next(err)` explícito.

**Tabla de refactor (17 sitios)**:

| Archivo:línea                        | Patrón | Reemplazo                                                                                                                                                         |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| properties.ts:294 (LOOKUP_FAILED)    | A      | `throw new AppError(500, "No se pudo validar la propiedad", "LOOKUP_FAILED")` **PERO exponer msg custom** → usar `internal(msg, code)` que setea `expose=true`    |
| properties.ts:463 (orgId)            | B      | `throw err;` (asyncHandler ya está en el handler)                                                                                                                 |
| properties.ts:537 (UPSERT_NO_MATCH)  | A      | `throw internal("No se pudo actualizar: id no existe o pertenece a otra org", "UPSERT_NO_MATCH")`                                                                 |
| properties.ts:672 (owners)           | B      | `throw err;` (envuelto en `withTransaction`, catch actual loguea + 500 → simplificable)                                                                           |
| properties.ts:731 (units)            | B      | `throw err;` (igual que 672)                                                                                                                                      |
| properties.ts:849 (UNHANDLED POST)   | B      | `throw err;` (simplificar el try/catch externo)                                                                                                                   |
| tenants.ts:395 (UNHANDLED POST)      | B      | `throw err;`                                                                                                                                                      |
| tenants.ts:947 (UNHANDLED POST)      | B      | `throw err;`                                                                                                                                                      |
| saasBilling.ts:157 (NO_TRIAL_PLAN)   | A      | `throw internal("No se pudo inicializar plan trial", "NO_TRIAL_PLAN")`                                                                                            |
| saasBilling.ts:224 (DB_UNAVAILABLE)  | A      | `throw internal("Error creando la cuenta. Reintentá en unos minutos.", "DB_UNAVAILABLE")`                                                                         |
| notifications.ts:147 (whatsapp)      | B      | `throw err;` (Twilio errors ya tienen `expose=true` implícito si el caller quiere, sino errorHandler los trata como internal)                                     |
| notifications.ts:171 (whatsapp/test) | B      | `throw err;`                                                                                                                                                      |
| notifications.ts:348 (email/test)    | B      | `throw err;`                                                                                                                                                      |
| notifications.ts:391 (email/send)    | B      | `throw err;`                                                                                                                                                      |
| admin.ts:61 (seed)                   | A      | `throw internal(err?.message ?? "Error en seed", "SEED_ERROR")` — **YA NO expone `sql` ni `mysqlCode`** al cliente, se loguea con `console.error` antes del throw |
| admin.ts:89 (counts)                 | B      | `throw err;`                                                                                                                                                      |
| auth.ts:215 (login)                  | B      | `throw err;`                                                                                                                                                      |

### AC-5: Shape uniforme en TODAS las respuestas de error

- `GET /api/health` en estado `degraded`: shape actual `{status, timestamp, db: {ok, error}}` se mantiene (es un caso especial de healthcheck, no es "error de endpoint").
- TODOS los otros errores (4xx, 5xx) responden:
  ```json
  { "error": "string", "code": "string" }
  ```
- Sin campos extra (`sql`, `mysqlCode`, `hint`, `ok`).
- **Excepción**: notificaciones mantiene `ok: false` en su handler interno (línea 348, 391) PORQUE es parte de un shape de operación batch — pero el body del error sigue siendo `{ error, code }`. (Decisión: NO romper compatibilidad de callers existentes, solo normalizar el body del error.)

### AC-6: Logs uniformes en consola

- Cada error que pasa por `errorHandler` loguea **una sola línea** con formato:
  ```
  [errorHandler] METHOD /path → statusCode (code=XXX, msg=YYY, stack=<presente|ausente>)
  ```
- Los `console.error` redundantes en los handlers se eliminan (eran un duplicado del logging de `errorHandler`).
- Stack trace solo se loguea si `statusCode >= 500` (no spamear logs con 4xx).

### AC-7: Tests E2E (verifier) escrito y validado

- `tests/verifiers/fix-issue-27-unified-error-handling.md` creado con checklist binario.
- Cada AC (1-6) tiene al menos 1 paso del verifier.
- **Antes de tocar código**: el verifier corre contra el estado actual y reporta AC-1 = FAIL (los 17 sitios siguen ahí). Eso es esperado, no es trampa.

## 4. Edge Cases

### E-1: `res.headersSent === true`

- Si el error llega DESPUÉS de que Express ya empezó a enviar la respuesta (ej: stream que falla a mitad), `errorHandler` ya tiene la lógica de no responder de nuevo. **Sin cambios**.

### E-2: Error en middleware pre-ruta (cookie-parser, body-parser)

- Body parser tira `entity.parse.failed` con `err.type = 'entity.parse.failed'`. `errorHandler` lo maneja → 400 con `code: "INVALID_JSON"`. **Sin cambios**.

### E-3: `next(err)` desde un handler NO-async

- Funciona igual. Express 4 propaga al error middleware. **Sin cambios**.

### E-4: Rate limit devuelve 429 con shape custom

- `rateLimit` middleware en `server/middleware/rateLimit.ts` ya responde JSON. Verificar que su shape coincide con `{ error, code }` y ajustar si no. **Pendiente de revisar al implementar**.

### E-5: Endpoint que responde HTML intencionalmente

- Hoy no hay ninguno (la regla AGENTS.md es explícita: NUNCA HTML). Si en el futuro se agrega un endpoint de descarga binaria, **DEBE** ir antes de `app.use(errorHandler)` en `server.ts:175` y NO usar `next(err)`. Out of scope.

### E-6: Cliente espera campos extra (`ok: false`, `hint`, `messageId`)

- Verificar callers de los 17 endpoints refactorizados. Si alguno parsea `body.hint` o `body.sql`, ajustar el caller. **Tarea del implementador**: hacer grep `body\.hint|body\.sql|body\.ok` en `src/` y actualizar los 2-3 sitios que matcheen.

## 5. Technical Contract

### Nuevo archivo: `server/lib/errors.ts`

```typescript
import { Request, Response, NextFunction, RequestHandler } from "express";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly expose: boolean = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// 4xx factories — expose = true (cliente ve el mensaje)
export const badRequest = (m: string, c = "BAD_REQUEST") =>
  new AppError(400, m, c, true);
export const unauthorized = (m: string, c = "UNAUTHORIZED") =>
  new AppError(401, m, c, true);
export const forbidden = (m: string, c = "FORBIDDEN") =>
  new AppError(403, m, c, true);
export const notFound = (m: string, c = "NOT_FOUND") =>
  new AppError(404, m, c, true);
export const conflict = (m: string, c = "CONFLICT") =>
  new AppError(409, m, c, true);

// 5xx factories — expose = false por default, salvo que el caller quiera exponer
export const internal = (m: string, c = "INTERNAL") =>
  new AppError(500, m, c, false);
export const serviceUnavailable = (m: string, c = "SERVICE_UNAVAILABLE") =>
  new AppError(503, m, c, false);

// Re-export del asyncHandler existente para un solo punto de import
export { asyncHandler } from "./asyncHandler.js";
```

### `server/lib/errorHandler.ts` — patch mínimo

```typescript
import { AppError } from "./errors.js";

export function errorHandler(err, req, res, next) {
  // entity.parse.failed ya manejado — sin cambios
  if (err?.type === "entity.parse.failed") {
    /* ... */
  }

  if (res.headersSent) return;

  let statusCode: number;
  let code: string;
  let message: string;
  let expose: boolean;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.expose ? err.message : "Internal server error";
    expose = err.expose;
  } else {
    statusCode = err?.statusCode ?? err?.status ?? 500;
    code = err?.code ?? "INTERNAL";
    expose = false;
    message = expose
      ? (err?.message ?? "Internal server error")
      : "Internal server error";
  }

  // Logging uniforme
  if (statusCode >= 500) {
    console.error(
      `[errorHandler] ${req.method} ${req.path} → ${statusCode} (code=${code}, msg=${err?.message ?? "(no msg)"}, stack=${err?.stack ? "presente" : "ausente"})`,
    );
  } else {
    console.warn(
      `[errorHandler] ${req.method} ${req.path} → ${statusCode} (code=${code}, msg=${message})`,
    );
  }

  res.status(statusCode).json({ error: message, code });
}
```

### Caller pattern (ejemplo antes/después de properties.ts:849)

```typescript
// ANTES (líneas 820-855):
} catch (err: any) {
  console.error("[POST /api/properties] UNHANDLED:", err.message ?? err);
  if (err?.stack) console.error(err.stack);
  if (!res.headersSent) {
    res.status(500).json({
      error: "Error inesperado guardando propiedad: " + (err.message ?? String(err)),
    });
  }
}

// DESPUÉS:
// (eliminar el try/catch externo — asyncHandler catchea y llama next(err))
// Si querés mantener el try/catch para logging custom:
} catch (err) {
  // Opcional: log específico del dominio antes de propagar
  console.error("[POST /api/properties] domain context:", { orgId, propertyId });
  throw err;  // asyncHandler → next(err) → errorHandler
}
```

## 6. Timeouts explícitos

- **N/A para este fix.** No agrega llamadas externas. Solo reorganiza el manejo de errores que ya existen.

## 7. Tostadas exactas (copy approved)

> **Este fix NO agrega toasts nuevos** — son del frontend, que ya las muestra cuando recibe un 4xx/5xx. Verificar que los mensajes del backend coincidan con los que el frontend ya muestra:

| Status | Backend `error`                                | Toast del frontend (verificar en `src/`)                    |
| ------ | ---------------------------------------------- | ----------------------------------------------------------- |
| 400    | "Faltan campos requeridos: address, ownerName" | "Faltan datos para guardar la propiedad"                    |
| 401    | "Sesión inválida" o "Sin sesión"               | "Tu sesión expiró. Volvé a iniciar sesión."                 |
| 403    | "No podés crear recursos en otra organización" | "No tenés permiso para esta acción"                         |
| 404    | "Propiedad no encontrada"                      | "No encontramos esa propiedad"                              |
| 409    | "Ya existe una cuenta con ese email"           | "Ya existe una cuenta con ese email"                        |
| 429    | (de rateLimit middleware)                      | "Demasiados intentos. Esperá unos minutos."                 |
| 500    | "Internal server error"                        | "Error del servidor. Reintentá en unos minutos." (genérico) |
| 503    | "Service unavailable"                          | "Servicio no disponible. Reintentá en unos minutos."        |

> **Tarea del implementador**: confirmar 1-a-1 con grep en `src/` que cada toast matchea. Si hay mismatch, NO arreglar el frontend en este PR — abrir issue aparte.

## 8. Dependencias

### Archivos a crear

- `server/lib/errors.ts` (nuevo, ~30 líneas)

### Archivos a modificar

- `server/lib/errorHandler.ts` (patch ~10 líneas)
- `server/routes/properties.ts` (~15 líneas modificadas en 6 sitios)
- `server/routes/tenants.ts` (~10 líneas en 2 sitios)
- `server/routes/saasBilling.ts` (~8 líneas en 2 sitios)
- `server/routes/notifications.ts` (~12 líneas en 4 sitios)
- `server/routes/admin.ts` (~10 líneas en 2 sitios)
- `server/routes/auth.ts` (~4 líneas en 1 sitio)

### Archivos a NO tocar (out of scope)

- `server/middleware/rateLimit.ts` (ya devuelve JSON, verificar en FASE 4)
- `server.ts` (errorHandler ya está montado en línea 175)
- Frontend (excepto el grep de verificación de toasts)

## 9. Out of Scope

- **Refactor del monolito `PropertiesView.tsx`** (Fase 2 del proyecto).
- **Vitest tests** para `errorHandler` (decisión pendiente per AGENTS.md; el verifier E2E cubre lo importante).
- **Migrar TODOS los handlers a `asyncHandler`** (algunos endpoints pueden quedar con try/catch explícito si el caller lo prefiere — es opcional, no requirement).
- **Cambiar el formato de `GET /api/health`** (es un caso especial de healthcheck).
- **CSP / helmet / otros headers de seguridad** (issue aparte).

## 10. Riesgos identificados

- **R1**: Si un caller parseaba `body.sql` o `body.hint` y se elimina, el frontend rompe. **Mitigación**: grep en `src/` ANTES de mergear. Si hay matches, abrir issue aparte.
- **R2**: Cambiar el logging puede romper un dashboard de logs que parseaba el formato viejo. **Mitigación**: el formato viejo era `console.error("[POST /api/X] UNHANDLED:")` (inconsistente entre archivos). El nuevo es uniforme. Aceptable.
- **R3**: Si `errorHandler` rompe por un error que no es `AppError`, podría tirar 500 sin shape correcto. **Mitigación**: el código defensivo (`statusCode = err?.statusCode ?? err?.status ?? 500`) ya existe y se mantiene.

## 11. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]

---

## Anexo: comandos de auditoría para correr ANTES de implementar

```bash
# Confirmar el inventario actual (debe dar 17)
grep -rn "res\.status(500)" server/routes/

# Identificar callers que dependan de campos que se van a eliminar
grep -rn "body\.hint\|body\.sql\|body\.mysqlCode" src/

# Confirmar que errorHandler existe
cat server/lib/errorHandler.ts | head -5
```

Una vez aprobado, sigue FASE 3: crear `tests/verifiers/fix-issue-27-unified-error-handling.md` (sin tocar código).
