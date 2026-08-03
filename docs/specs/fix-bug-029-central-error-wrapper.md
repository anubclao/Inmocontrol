# Fix: Central error wrapper for Express routes (BUG-029)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-029-central-error-wrapper.md`.
>
> **Bug origen**: BUG-029 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media (estratégico, mata 5+ bugs a la vez).
> **Stack afectado**: `server/lib/` (nuevo), `server/routes/*.ts` (refactor), `server.ts` (registro del middleware).

## 1. User Story

**As a** mantenedor del backend de InmoControl,
**I want to** que cada route handler esté envuelto en un wrapper central que captura errores asíncronos y los convierte a JSON responses consistentes,
**So that** ningún error se escape al default error handler de Express (que devuelve HTML 500), y el frontend siempre pueda parsear las respuestas con `response.json()` sin tirar `SyntaxError`.

## 2. Contexto del bug

### Estado actual (problemático)

- **151 ocurrencias** de `try { ... } catch (err: any) { res.status(500).json(...) }` en `server/routes/*.ts` (5 archivos).
- Cada handler repite el pattern. La consistencia del shape `{ error: string }` se mantiene **por convención**, no por abstracción.
- **6 endpoints** tienen el antipatrón: `const orgId = await ensureDefaultOrg();` ANTES del bloque `try`. Si esa llamada tira, se va al default error handler de Express (HTML 500).
- `tenants.ts:62-211` y `properties.ts:240-562` y `entities.ts` tienen try top-level. El resto **no**.
- 2 middlewares globales al final de `server.ts` filtran aborts y 500, pero **no capturan async errors** que tiren antes del `try` local.

### Resultado

| Escenario | Comportamiento actual | Comportamiento esperado |
|---|---|---|
| Error dentro de `try` local | 500 JSON | 500 JSON |
| Error ANTES del `try` (ej. `ensureDefaultOrg` falla) | **HTML 500** (default Express) | 500 JSON |
| Handler async que tira fuera de try | **HTML 500** | 500 JSON |
| Error de cualquier tipo no atrapado | **HTML 500** | 500 JSON con shape consistente |

### Por qué importa

- **6 endpoints están rotos silenciosamente** en cualquier condición de error antes del try local.
- Cualquier nuevo endpoint que se agregue **es propenso a olvidar el try/catch**.
- Migrar a un wrapper central es **estructural**: protege los 6 endpoints existentes Y los futuros.

## 3. Acceptance Criteria

### AC-1: Existe `server/lib/asyncHandler.ts` que envuelve handlers async
- La función toma un handler `(req, res, next) => Promise<any>` y lo envuelve para que cualquier error que tire se propague a `next(err)`.
- **NO** modifica el handler, solo lo envuelve.
- Preserva el `req`, `res`, `next` originales.
- El wrapper NO hace `console.log` por default (silencioso, Express logger lo maneja).

```typescript
// Forma de uso:
import { asyncHandler } from '../lib/asyncHandler';

router.post('/foo', asyncHandler(async (req, res) => {
  // ... lógica del handler sin try/catch ...
  // Si tira algo, asyncHandler lo manda a next(err)
}));
```

### AC-2: Middleware central de errores en `server.ts`
- Express necesita un middleware con **4 argumentos** (`(err, req, res, next)`) al final de la pila.
- Captura cualquier error de `next(err)` o error async no atrapado.
- Devuelve siempre **JSON** con shape `{ error: string, code?: string, details?: any }`.
- Status code según `err.statusCode` o `err.status` (Express convention), default 500.
- Si el error tiene `err.expose === true`, se incluye `err.message`. Si no, mensaje genérico "Internal server error" (evita leak de internals).
- Loguea el error con `console.error` (incluye stack si es 500).

### AC-3: Migración gradual de los 6 endpoints con el antipatrón
Los 6 endpoints identificados con `const orgId = await ensureDefaultOrg();` (o equivalente) ANTES del try local:

1. `server/routes/billing.ts:165-166` — `PUT /api/billing/policies/:propertyId`
2. `server/routes/billing.ts:214-215` — `POST /api/billing/amortization/generate`
3. `server/routes/inventories.ts:98-153` — `POST /api/inventories`
4. `server/routes/billing.ts:296-340` — `POST /api/billing/payments` (parcial, tiene otro bug BUG-008)
5. `server/routes/properties.ts:273-300` — `POST /api/properties` (parcial, las llamadas a Drive están fuera del try)
6. `server/routes/googleAuth.ts` — varios endpoints (revisar)

**Para cada uno:**
- Mover el código que está ANTES del `try` DENTRO del try (sin asyncHandler), O
- Convertir el handler completo a `asyncHandler(async (req, res) => { ... })` y remover el try local (el wrapper central lo maneja).
- **Decisión a tomar**: en este fix, preferimos la opción 2 (usar asyncHandler) para que **el patrón sea uniforme** y todos los handlers se vean iguales.

### AC-4: Handlers existentes con try/catch local SE PRESERVAN
- `tenants.ts`, `properties.ts`, `entities.ts`, `saasBilling.ts` ya tienen try/catch locales.
- **NO se tocan en este fix** (out of scope: refactor completo es riesgoso).
- Solo los 6 endpoints del AC-3 se migran.

### AC-5: El response shape es siempre `{ error: string, code?: string }`
- Para 400: `{ "error": "Faltan campos...", "code": "MISSING_FIELDS" }`
- Para 500: `{ "error": "Internal server error", "code": "INTERNAL" }` (sin leak)
- Para 500 con `err.expose=true`: `{ "error": "Error message", "code": "EXPOSED" }`
- Para 404 (recurso no existe): `{ "error": "Property not found", "code": "NOT_FOUND" }`

### AC-6: No se introducen nuevas dependencias
- El wrapper es 10 líneas de TypeScript puro.
- El middleware es 20 líneas de TypeScript puro.
- **No** usar `express-async-errors`, `express-async-handler`, ni similares. Mantener cero deps nuevas (regla de AGENTS.md).

### AC-7: Compatibilidad con la regla de Karpathy "NO rompas el monolito en un solo commit"
- El fix se hace en 2 commits:
  1. Commit 1: agregar `server/lib/asyncHandler.ts` + middleware en `server.ts` (sin tocar handlers).
  2. Commit 2: migrar los 6 endpoints al wrapper.
- Cada commit pasa el lint y la app sigue arrancando.

## 4. Edge Cases

### EC-1: Error de sintaxis JSON en el body
- Body: `xxx` (no es JSON).
- **Esperado**: middleware central devuelve 400 `{ "error": "Unexpected token 'x'...", "code": "INVALID_JSON" }`.
- **Actual**: `500 { "error": "Unexpected token 'x'..." }` (status 500 incorrecto, debería ser 400).
- **Decisión**: el middleware central detecta `err.type === 'entity.parse.failed'` y devuelve 400 con code `INVALID_JSON`.

### EC-2: Error de FK constraint en MySQL
- `err.code = 'ER_NO_REFERENCED_ROW_2'` o similar.
- **Esperado**: el middleware NO cambia el status (sigue siendo 500). Loguea el SQL error para debug. Devuelve JSON genérico al cliente.
- **Out of scope**: traducir errores SQL a mensajes user-friendly. Eso es un fix futuro.

### EC-3: Abort del cliente (ECONNABORTED, "request aborted")
- El cliente cierra la conexión antes de que termine el handler.
- **Esperado**: el middleware NO responde (la conexión ya está cerrada). El error se loguea como warning, no como error. NO se llama a `res.json()` porque tira.
- Ya hay un filtro para esto en `server.ts:140-148`. **NO se duplica**.

### EC-4: Error en una llamada a Google Drive (`drive.files.list`)
- Drive está caído o token expirado.
- **Esperado**: 500 JSON `{ "error": "Internal server error", "code": "DRIVE_ERROR" }` con el error logueado internamente.
- **Out of scope**: reintentar la llamada. Eso es un fix futuro (con backoff).

### EC-5: Un endpoint que YA usa asyncHandler pero tira un error sync
- El handler es `asyncHandler((req, res) => { throw new Error('sync') })`.
- **Esperado**: el error se captura igual (Express 4 NO lo hace por default, pero `asyncHandler` envuelve en `Promise.resolve().then(handler).catch(next)`).
- **Verificación**: agregar un test manual que tire sync desde un handler con asyncHandler y ver que devuelve 500 JSON.

## 5. Technical Contract

### Archivo nuevo: `server/lib/asyncHandler.ts`

```typescript
import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Envuelve un handler async para que cualquier error se propague a `next(err)`.
 * Express 4 NO captura errores async por default; este wrapper lo arregla.
 * No usar express-async-errors ni similares (regla: 0 deps nuevas).
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

### Archivo nuevo: `server/lib/errorHandler.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction  // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  // JSON parse error → 400
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: err.message,
      code: 'INVALID_JSON',
    });
    return;
  }

  // Errores esperados (4xx) que el handler llamó con res.status(...).json(...)
  // ya están responded. Si llegamos acá es porque el handler no respondió.
  if (res.headersSent) {
    return;  // No podemos responder de nuevo
  }

  const status = err?.statusCode ?? err?.status ?? 500;
  const expose = err?.expose === true;
  const message = status < 500 || expose
    ? (err?.message ?? 'Internal server error')
    : 'Internal server error';

  if (status >= 500) {
    console.error(`[errorHandler] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    error: message,
    code: err?.code ?? (status >= 500 ? 'INTERNAL' : 'CLIENT_ERROR'),
  });
}
```

### Cambio en `server.ts`

```typescript
// Al final, después de los middlewares existentes:
import { errorHandler } from './lib/errorHandler';
app.use(errorHandler);
```

### Ejemplo de migración de un endpoint

**Antes** (billing.ts):
```typescript
router.post('/amortization/generate', async (req, res) => {
  const orgId = await ensureDefaultOrg();  // ← si falla, HTML 500
  const { contract, policy } = req.body as any;
  if (!contract?.id || !policy?.propertyId) {
    return res.status(400).json({ error: '...' });
  }
  try {
    // ... lógica ...
    res.json(rows);
  } catch (err: any) {
    console.error('[amortization/generate]', err);
    res.status(500).json({ error: err?.message });
  }
});
```

**Después**:
```typescript
import { asyncHandler } from '../lib/asyncHandler';

router.post('/amortization/generate', asyncHandler(async (req, res) => {
  const orgId = await ensureDefaultOrg();  // ← si falla, JSON 500 (vía middleware)
  const { contract, policy } = req.body as any;
  if (!contract?.id || !policy?.propertyId) {
    return res.status(400).json({ error: '...' });
  }
  // ... lógica ...
  res.json(rows);
  // No try/catch: el middleware lo maneja
}));
```

## 6. Tostadas exactas (copy approved — NO improvisar)

Este fix es server-side, no tiene toasts. Pero el cliente puede mejorar los mensajes de error genéricos si quiere (out of scope).

## 7. Out of Scope

- **Migrar `tenants.ts`, `properties.ts`, `entities.ts`, `saasBilling.ts`** (que ya tienen try local). Riesgo de regression alto, fuera de scope.
- **Refactor del `requireAuth` middleware**. Funciona bien, no se toca.
- **Traducir SQL errors a mensajes user-friendly**. Decisión de diseño, fuera de scope.
- **Reintentar llamadas a Drive con backoff**. Otro fix.
- **Tests automatizados con Vitest**. Verifier E2E manual.
- **Remover el `if (res.headersSent) return;` workaround**. En el futuro, Express 5 lo manejará nativo.

## 8. Dependencias

### Archivos nuevos
- `server/lib/asyncHandler.ts` (10 líneas)
- `server/lib/errorHandler.ts` (30 líneas)

### Archivos a modificar
- `server.ts` (1 import + 1 línea `app.use(errorHandler)`)
- `server/routes/billing.ts` (2 endpoints migrados)
- `server/routes/inventories.ts` (1 endpoint migrado)
- `server/routes/properties.ts` (1 endpoint migrado, parcial)
- `server/routes/googleAuth.ts` (revisar cuántos endpoints requieren migración)

### Archivos a NO tocar
- `server/routes/tenants.ts` (ya tiene try local)
- `server/routes/entities.ts` (ya tiene try local)
- `server/routes/saasBilling.ts` (ya tiene try local)
- `server/db.ts` (helpers, no se toca)
- Todos los archivos de `src/` (cliente no afectado)

## 9. Riesgos identificados

- **Cambio de comportamiento en errores que antes eran HTML 500**: pasan a ser 500 JSON. Riesgo: el frontend podría no manejar el nuevo shape consistentemente. Mitigación: el shape es el mismo `{ error: string }` que ya usa el 90% de los handlers.
- **Performance**: el wrapper agrega 1 `Promise.resolve().then().catch()` por request. Impacto negligible.
- **`res.headersSent` race condition**: si el handler llama a `res.json()` Y tira después, Express ya envió headers. El middleware chequea `res.headersSent` para no intentar responder de nuevo. Riesgo bajo pero documentado.
- **Logging duplicado**: si el handler tiene `console.error(err)` Y el middleware también, se loguea 2 veces. Mitigación: remover los `console.error` de los handlers migrados.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03
