# Fix: ensureDefaultOrg() fuera del try en billing.ts (BUG-006)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-006-ensure-default-org-inside-try.md`.
>
> **Bug origen**: BUG-006 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/billing.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cualquier error de MySQL/schema/FK durante `ensureDefaultOrg()` devuelva JSON 500 (no HTML 500),
**So that** el frontend siempre pueda parsear la respuesta de error y mostrar un mensaje accionable, en vez de tirar `SyntaxError` por respuesta HTML.

## 2. Contexto del bug

### Patrón roto (varios endpoints en billing.ts)

```ts
router.post("/charges", async (req, res) => {
  const orgId = await ensureDefaultOrg();   // ← FUERA del try
  const c = req.body as { ... };
  try {
    await pool.query(...);                  // solo esto está protegido
    res.json({ ok: true, id: c.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});
```

### Resultado

Si `ensureDefaultOrg()` lanza (MySQL caído, schema drift, FK corrupta, conn limit):

- Express agarra con su **default error handler**.
- Devuelve **HTML stacktrace** como response.
- Frontend tira `SyntaxError: Unexpected token '<'` al hacer `res.json()`.
- Toast de error nunca aparece, user ve spinner eterno.

### Catálogo menciona líneas 165-166 y 214-215 (versión pre-asyncHandler)

En la versión actual del archivo, los endpoints con este patrón son (al menos):

- `POST /api/billing/charges` (línea ~519)
- `GET /api/billing/charges` (línea ~566)
- `DELETE /api/billing/charges/:id` (línea ~592)
- `GET /api/billing/charges/invoice-summary` (línea ~620)
- `POST /api/billing/discounts` (línea ~647)
- `GET /api/billing/discounts` (línea ~714)
- `POST /api/billing/increases` (línea ~735)
- `GET /api/billing/increases` (línea ~775)

(El catálogo de BUGS.md dice "2 endpoints" pero el patrón se repite en todos los
siguientes. Este fix lo arregla en TODOS para evitar regresión.)

## 3. Acceptance Criteria

### AC-1: `ensureDefaultOrg()` se llama DENTRO del try block

- Cada handler con `const orgId = await ensureDefaultOrg();` se mueve al
  primer statement del `try` correspondiente.
- NO queda ningún `ensureDefaultOrg()` colgando antes del `try`.

### AC-2: Cualquier error devuelve JSON 500 con `{ error: string }`

- Si `ensureDefaultOrg()` lanza `Error("ECONNREFUSED")`, la response debe
  ser `500` con body `{ "error": "ECONNREFUSED" }` (o el mensaje real).
- Verificable con `curl -X POST .../api/billing/charges -d '{}'` contra una
  DB caída.

### AC-3: Endpoints que ya usan `asyncHandler` se mantienen

- `PUT /api/billing/policies/:id`, `POST /api/billing/payments`,
  `POST /api/billing/amortization/generate`, `POST /api/billing/invoices/send`
  (los migrados en BUG-029) **NO** se tocan.
- Solo se modifican los endpoints con el patrón `try/catch` manual + `ensureDefaultOrg` afuera.

### AC-4: Comportamiento exitoso sin cambios

- Para todas las requests que SÍ funcionan, el response es idéntico al actual
  (mismo status, mismo body).
- No hay regresión funcional.

## 4. Edge Cases

### EC-1: `ensureDefaultOrg()` funciona, falla el INSERT

- Se ejecuta dentro del try, así que la response es `500 JSON` con el error
  del INSERT (comportamiento idéntico al actual).

### EC-2: `ensureDefaultOrg()` lanza, ¿se hace rollback?

- `ensureDefaultOrg()` no toca tablas — solo lee/crea 1 fila en `organizations`
  si no existe. Si esa operación falla, no hay nada que rollback.
- El `try` no necesita transacciones explícitas para este fix.

### EC-3: Endpoint sin body (ej. GET /charges)

- Mover `ensureDefaultOrg()` dentro del try es seguro — el orden de
  operaciones no cambia semánticamente.

### EC-4: `req.body` parsing falla ANTES del try

- El error es atrapado por el `errorHandler` central (BUG-029) que devuelve
  `400 INVALID_JSON`. Fuera de scope de este fix.

## 5. Technical Contract

### Patrón actual (roto)

```ts
router.post("/charges", async (req, res) => {
  const orgId = await ensureDefaultOrg();   // ← si falla → HTML 500
  const c = req.body as { ... };
  try { ... }
});
```

### Patrón target (correcto)

```ts
router.post("/charges", async (req, res) => {
  const c = req.body as { ... };
  try {
    const orgId = await ensureDefaultOrg();   // ← si falla → JSON 500
    await pool.query(...);
    res.json({ ok: true, id: c.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});
```

### Lista de endpoints a tocar

1. `POST /api/billing/charges`
2. `GET /api/billing/charges`
3. `DELETE /api/billing/charges/:id`
4. `GET /api/billing/charges/invoice-summary`
5. `POST /api/billing/discounts`
6. `GET /api/billing/discounts`
7. `POST /api/billing/increases`
8. `GET /api/billing/increases`

(Si aparecen más durante el impl, se arreglan también.)

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                             | Tipo  | Copy exacto                                               |
| ----------------------------------- | ----- | --------------------------------------------------------- |
| Error de `ensureDefaultOrg()` en UI | error | `No se pudo conectar a la base de datos. Reintentá.`      |
| `req.body` mal formado              | error | `JSON inválido. Revisá el formato.` (BUG-029 ya lo cubre) |

## 7. Out of Scope

- Migrar estos endpoints a `asyncHandler` (BUG-029). El patrón manual
  `try/catch` es feo pero funcional; el fix solo se enfoca en mover la
  llamada vulnerable.
- Agregar timeout a `pool.query`. Out of scope de este fix.
- Tests automatizados con Vitest. Verifier E2E manual.

## 8. Dependencias

- **BUG-029** (ya aplicado): `server/lib/errorHandler.ts` ya devuelve JSON
  para errores que llegan al middleware central. Este fix previene que
  lleguemos a ese caso para `ensureDefaultOrg()`.
- Sin nuevas deps.

## 9. Effort

- ~10 minutos por endpoint × 8 = 1.5 horas, o menos si se hace con
  replace masivo.

---

**Pendiente de aprobación del usuario.**
