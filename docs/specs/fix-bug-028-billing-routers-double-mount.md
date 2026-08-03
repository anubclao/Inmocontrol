# Fix: routers con mismo path /api/billing (BUG-028)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-028-billing-routers-double-mount.md`.
>
> **Bug origen**: BUG-028 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟢 Baja (no es bug funcional, es DX).
> **Stack afectado**: `server.ts:77, 80`.

## 1. User Story

**As a** developer que trabaja en InmoControl,
**I want to** que el orden de mounting de routers en `server.ts` sea explícito y testeable, no implícito,
**So that** no haya ambigüedad sobre qué router maneja cada path (e.g. `/api/billing/banks` vs `/api/billing/policies`).

## 2. Contexto del bug

### Estado actual (`server.ts:77-80`)

```ts
app.use("/api/entities", entitiesRouter);
app.use("/api/billing", billingRouter);

// Bank accounts e insurance policies viven bajo /api/billing/* también
app.use("/api/billing", banksRouter);
```

Dos routers montados en el mismo path. Si ambos definen `router.get('/x')`,
gana el ÚLTIMO (`banksRouter`).

### Resultado (potencial)

- `billingRouter` define `GET /policies/:id`.
- `banksRouter` define `GET /bank-accounts`.
- Si en el futuro alguien agrega `GET /policies` en `banksRouter` por error
  (refactor), el endpoint `/api/billing/policies` cambia de comportamiento
  silenciosamente.

Hoy NO hay colisión (los paths no se solapan), pero el patrón es frágil.

## 3. Acceptance Criteria

### AC-1: Mover `banksRouter` a su propio namespace

- Decisión: `/api/billing/banks` para bank accounts, `/api/billing/insurance` para insurance.
- Cambiar `app.use("/api/billing", banksRouter)` por:
  ```ts
  app.use("/api/billing/banks", banksRouter);
  app.use("/api/billing/insurance", insuranceRouter); // si existe
  ```
- Actualizar el frontend (`src/features/billing/api.ts` y callers) para
  apuntar a las nuevas URLs.

### AC-2: O alternativa — consolidar routers

- Mover todas las rutas de `banksRouter` al final de `billingRouter`.
- Borrar `banksRouter` y `app.use("/api/billing", banksRouter)`.
- Pros: 1 solo router, sin ambigüedad.
- Contras: archivo `billingRouter` más grande.

### AC-3: Documentar el orden

- Si se queda con 2 routers, agregar comentario explícito en `server.ts`:
  ```ts
  // IMPORTANTE: el orden importa. /api/billing/* se matchea con el
  // PRIMER router que tenga la ruta. Si ambos definen el mismo path,
  // gana billingRouter (montado primero).
  app.use("/api/billing", billingRouter);
  app.use("/api/billing", banksRouter); // solo para /bank-accounts y /insurance/*
  ```

### AC-4: Test E2E del orden

- Hacer un GET a cada endpoint conocido y verificar que responde el router esperado.
- Documentar en el verifier el orden actual de los routers.

## 4. Edge Cases

### EC1: Hay un endpoint en `banksRouter` que no existe en `billingRouter`

- Hoy no hay colisión, así que da igual quién responda.
- Si se mueve a namespace separado, hay que actualizar el cliente.

### EC2: `insuranceRouter` no existe todavía

- Solo banksRouter. La colisión potencial es solo entre billing y banks.
- Dejar insurance fuera de scope.

### EC3: Tests automatizados (Vitest) no existen todavía

- Out of scope. Verifier manual con curl.

## 5. Technical Contract

### Antes (orden implícito)

```ts
app.use("/api/billing", billingRouter); // matchea /policies/*, /payments/*, etc.
app.use("/api/billing", banksRouter); // matchea /bank-accounts, /insurance/*
```

### Después (orden explícito + namespace separado)

Opción A (recomendada):

```ts
app.use("/api/billing", billingRouter);
app.use("/api/billing/banks", banksRouter);
app.use("/api/billing/insurance", insuranceRouter); // futuro
```

Opción B (consolidar):

```ts
app.use("/api/billing", billingRouter); // incluye bank-accounts
// (banksRouter borrado)
```

## 6. Tostadas exactas (copy approved — NO improvisar)

(N/A — fix sin cambios de UX)

## 7. Out of Scope

- Refactor de la estructura interna de los routers (cada uno mantiene su lógica).
- Mover routers a subdominios (`billing.inmocontrol.com`).
- Estandarizar TODOS los routers (entities, notifications, etc.) al mismo patrón.

## 8. Dependencias

- `server.ts:77-80` modificado.
- `src/features/billing/api.ts` actualizado si se elige Opción A.

## 9. Effort

- Opción A: 15 min (cambiar namespace + actualizar cliente).
- Opción B: 1h (mover rutas + tests).
- **Total: 15 min - 1h según opción.**

---

**Pendiente de aprobación del usuario.**
