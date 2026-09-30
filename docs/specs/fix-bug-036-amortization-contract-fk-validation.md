# Fix: POST /api/billing/amortization/generate no valida que el contrato exista (BUG-036)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-036-amortization-contract-fk-validation.md`.
>
> **Bug origen**: ERROR en `server.err` del 2026-08-19:
> `[amortization/generate] Error: Cannot add or update a child row: a foreign key constraint fails (inmocontrol.amortization_rows, CONSTRAINT fk_amort_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE)`
> `contract-1782492025953` no existe en `contracts` (es un ID local generado por el cliente con `Date.now()`, no un UUID del server).
>
> **Severidad**: 🟠 Alta — bloquea el flujo de "Generar amortización" para cualquier contrato cuyo `id` no esté sincronizado con MySQL (caso típico: contratos huérfanos del caché de Zustand).
>
> **Stack afectado**: `server/routes/billing.ts` (~línea 235-330).

## 1. User Story

**As a** operador de InmoControl,
**I want** que cuando llamo a `POST /api/billing/amortization/generate` con un `contract.id` que NO existe en `contracts`, el server devuelva **400 JSON** con un mensaje accionable,
**So that** el frontend pueda mostrar "Este contrato ya no existe en el servidor. Recargá la página." en vez de un 500 opaco con stack trace de MySQL.

## 2. Contexto del bug

### Estado actual (`server/routes/billing.ts:235-330`)

```ts
router.post("/amortization/generate", asyncHandler(async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const { contract, policy } = req.body as { ... };
  if (!contract?.id || !policy?.propertyId) {
    return res.status(400).json({ error: "contract y policy son requeridos" });
  }
  // ⚠️ NO valida que contract.id exista en contracts
  // ⚠️ NO valida que el contrato pertenezca al orgId actual
  // ...
  for (const row of rows) {
    await pool.query(`INSERT INTO amortization_rows ... VALUES (?, ?, ?, ?, ...)`, [
      row.id, orgId, row.propertyId, row.contractId, ...
    ]);
    // ER_NO_REFERENCED_ROW_2 si contract_id no existe
  }
}));
```

### Resultado

- MySQL rechaza el INSERT con `ER_NO_REFERENCED_ROW_2` (FK constraint).
- El error es atrapado por `asyncHandler` → 500 JSON con `error.message` = "Cannot add or update a child row...".
- El cliente ve un mensaje técnico de MySQL y no sabe qué hacer.

### Caso típico que dispara el bug

- El usuario abre un tenant viejo en `TenantsView`.
- El store de Zustand todavía tiene un `contract-{Date.now()}` del caché (no sincronizado con MySQL).
- El usuario completa el wizard de Billing → llama `amortization/generate` con ese `contract.id`.
- El server no lo encuentra en `contracts` → 500 con FK violation.

## 3. Acceptance Criteria

### AC-1: El endpoint valida que `contract.id` exista en `contracts`

- Antes del loop de INSERTs, ejecutar:
  ```sql
  SELECT id, organization_id, property_id, status FROM contracts WHERE id = ? LIMIT 1
  ```
- Si el SELECT devuelve 0 filas → responder **400** JSON con:
  ```json
  {
    "error": "El contrato con id=X no existe en el servidor. Recargá la página para sincronizar.",
    "code": "CONTRACT_NOT_FOUND"
  }
  ```
- **NO** intentar el INSERT.

### AC-2: El endpoint valida que el contrato pertenezca al `orgId`

- Si `contract.organization_id !== orgId` → responder **403** JSON con:
  ```json
  {
    "error": "El contrato pertenece a otra organización.",
    "code": "CONTRACT_WRONG_ORG"
  }
  ```
- Previene IDOR cross-tenant (cuando se implemente multi-tenant).

### AC-3: El endpoint valida que `contract.propertyId` exista en `properties`

- Si la propiedad no existe → responder **400** JSON con:
  ```json
  {
    "error": "La propiedad asociada al contrato no existe.",
    "code": "PROPERTY_NOT_FOUND"
  }
  ```

### AC-4: Los errores siguen siendo JSON (BUG-029 compliance)

- Todos los AC-1/2/3 devuelven `res.status(...).json({ error, code })`.
- NUNCA HTML 500 por default de Express.

### AC-5: El happy path no se afecta

- Si el contrato y la propiedad existen y el orgId matchea → la amortización se genera igual que antes (cero regresiones).

## 4. Edge Cases

### EC-1: `contract.id` es null o vacío

- Ya cubierto por la validación existente en `billing.ts:243-247` (`if (!contract?.id ...)`).

### EC-2: `contract.organization_id` no viene en el body

- Asumir el `orgId` actual (single-tenant piloto).
- No rechazar.

### EC-3: El SELECT de validación mismo falla (MySQL down)

- `asyncHandler` propaga el error → 500 JSON con `code: "DB_ERROR"`.

## 5. Technical Contract

### Request (sin cambios)

```typescript
interface AmortizationGenerateRequest {
  contract: Contract;           // { id, organizationId?, propertyId, ... }
  policy: BillingPolicy;
}
```

### Response — error nuevo

```typescript
interface ContractNotFoundError {
  error: string;                // "El contrato con id=X no existe..."
  code: "CONTRACT_NOT_FOUND";
  contractId: string;           // eco del id recibido para debugging
}
```

### Response — error nuevo (cross-org)

```typescript
interface ContractWrongOrgError {
  error: string;
  code: "CONTRACT_WRONG_ORG";
}
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| `CONTRACT_NOT_FOUND` | error | `Este contrato ya no existe en el servidor. Recargá la página para sincronizar.` |
| `CONTRACT_WRONG_ORG` | error | `Este contrato pertenece a otra organización. Contactá al administrador.` |
| `PROPERTY_NOT_FOUND` | error | `La propiedad asociada al contrato no existe. Recargá la página.` |

## 7. Out of Scope

- Cambiar la lógica de `generateAmortization()` (cálculo puro) — no relacionado.
- Multi-tenant real — esta validación es defensiva hasta que llegue SaaS.
- Auto-cleanup de contratos huérfanos del caché de Zustand (feature separada).

## 8. Effort

- Validación en `billing.ts`: ~15 líneas, 0 deps.
- **Total: 15 min**.

## 9. Riesgos identificados

- **Falso positivo**: si un contrato recién creado (milisegundos antes) todavía no está en MySQL, el SELECT podría no verlo. **Mitigación**: leer del mismo pool con la misma transacción, o usar `READ COMMITTED` (default MySQL InnoDB).
- **Performance**: 1 query extra por request. La tabla `contracts` tiene índice PK en `id` → <1ms.

---

**Pendiente de aprobación del usuario.**