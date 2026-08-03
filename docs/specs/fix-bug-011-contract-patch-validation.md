# Fix: PATCH /api/contracts/:id sin validación (BUG-011)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-011-contract-patch-validation.md`.
>
> **Bug origen**: BUG-011 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/entities.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que PATCH /api/contracts/:id valide `status` contra el enum, rechace `rentAmount` negativo, valide fechas coherentes (`startDate <= endDate`) y rechace FK violations con 400/404 (no 500),
**So that** el endpoint devuelva errores accionables en vez de 500 confusos, y no se persistan datos corruptos.

## 2. Contexto del bug

### Estado actual (`server/routes/entities.ts:319-365`)

```ts
router.patch('/contracts/:id', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const { id } = req.params;
  const body = req.body ?? {};

  const fieldMap: Record<string, string> = { ... };

  const updates: string[] = [];
  const values: any[] = [];

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (body[camel] !== undefined) {        // ← acepta cualquier valor
      updates.push(`${snake} = ?`);
      values.push(body[camel]);              // ← sin validar tipo/rango
    }
  }
  // ... UPDATE con cualquier cosa ...
});
```

### Problemas concretos

1. **`status` libre**: `body.status = 'inventado'` → se persiste, luego la UI
   rompe al no saber mapearlo.
2. **`rentAmount` negativo**: `body.rentAmount = -1000000` → se persiste,
   el PDF muestra deuda negativa.
3. **`startDate > endDate`**: contrato con fechas invertidas → la amortización
   generada no tiene sentido.
4. **FK violation**: `body.propertyId = 'inexistente'` → MySQL tira 1452,
   Express devuelve 500 HTML.
5. **Tipo incorrecto**: `body.rentAmount = "mucho"` → MySQL trunca a 0 o
   rechaza, devuelve 500.

## 3. Acceptance Criteria

### AC-1: Helper `validateContractPatch(body)` central

- Crear `server/lib/contractValidation.ts` con la función:

  ```ts
  export interface ContractValidationError {
    field: string;
    code:
      | "INVALID_ENUM"
      | "NEGATIVE"
      | "INVALID_DATE"
      | "INVALID_TYPE"
      | "INVALID_FK";
    message: string;
  }

  export function validateContractPatch(body: any): ContractValidationError[] {
    const errors: ContractValidationError[] = [];

    if (body.status !== undefined) {
      const valid = ["active", "ended", "pending", "cancelled", "renewed"];
      if (!valid.includes(body.status)) {
        errors.push({
          field: "status",
          code: "INVALID_ENUM",
          message: `status debe ser uno de: ${valid.join(", ")}`,
        });
      }
    }

    if (body.rentAmount !== undefined) {
      const n = Number(body.rentAmount);
      if (isNaN(n) || n < 0) {
        errors.push({
          field: "rentAmount",
          code: "NEGATIVE",
          message: "rentAmount debe ser un número >= 0",
        });
      }
    }

    if (body.adminFee !== undefined) {
      const n = Number(body.adminFee);
      if (isNaN(n) || n < 0) {
        errors.push({
          field: "adminFee",
          code: "NEGATIVE",
          message: "adminFee debe ser un número >= 0",
        });
      }
    }

    if (body.commissionPct !== undefined) {
      const n = Number(body.commissionPct);
      if (isNaN(n) || n < 0 || n > 100) {
        errors.push({
          field: "commissionPct",
          code: "INVALID_TYPE",
          message: "commissionPct debe estar entre 0 y 100",
        });
      }
    }

    if (body.insurancePct !== undefined) {
      const n = Number(body.insurancePct);
      if (isNaN(n) || n < 0 || n > 100) {
        errors.push({
          field: "insurancePct",
          code: "INVALID_TYPE",
          message: "insurancePct debe estar entre 0 y 100",
        });
      }
    }

    // Fechas: si vienen AMBAS, validar coherencia
    if (body.startDate !== undefined && body.endDate !== undefined) {
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push({
          field: "startDate",
          code: "INVALID_DATE",
          message: "startDate / endDate deben ser fechas válidas ISO",
        });
      } else if (start > end) {
        errors.push({
          field: "endDate",
          code: "INVALID_DATE",
          message: "endDate debe ser >= startDate",
        });
      }
    } else if (body.startDate !== undefined) {
      if (isNaN(new Date(body.startDate).getTime())) {
        errors.push({
          field: "startDate",
          code: "INVALID_DATE",
          message: "startDate debe ser fecha válida ISO",
        });
      }
    } else if (body.endDate !== undefined) {
      if (isNaN(new Date(body.endDate).getTime())) {
        errors.push({
          field: "endDate",
          code: "INVALID_DATE",
          message: "endDate debe ser fecha válida ISO",
        });
      }
    }

    return errors;
  }
  ```

### AC-2: Handler usa el validador

- En `PATCH /contracts/:id`, ANTES del try principal:
  ```ts
  const errors = validateContractPatch(req.body);
  if (errors.length > 0) {
    return res
      .status(400)
      .json({ error: "Validation failed", details: errors });
  }
  ```

### AC-3: FK violations devuelven 400/404 (no 500)

- En el `catch` del UPDATE, si `err.code === 'ER_NO_REFERENCED_ROW_2'`:
  ```ts
  return res.status(400).json({
    error: "FK violation",
    field: "propertyId o tenantId no existe",
  });
  ```
- Si `err.code === 'ER_ROW_IS_REFERENCED_2'` (caso DELETE): 409 (BUG-012).

### AC-4: status solo acepta valores del enum

- Aplica al `status` map del schema (`active`/`ended`/`pending`/`cancelled`/`renewed`).
- Si llega cualquier otro, devuelve 400 con `INVALID_ENUM`.
- El validador centraliza la lista para que se reutilice en POST /contracts.

## 4. Edge Cases

### EC-1: Body completamente vacío

- `validateContractPatch({})` → `[]` → handler devuelve "Nothing to update" (status 200).
- No rompe.

### EC-2: Solo 1 fecha llega (sin la otra)

- `body.startDate` solo → valida formato ISO.
- No compara con `endDate` existente en la DB (eso sería un fix de Fase 2).
- Comportamiento aceptable: se acepta el PATCH.

### EC-3: Fechas en formato DD/MM/YYYY (no ISO)

- `new Date('31/12/2026')` → `Invalid Date` → error.
- El validador rechaza con `INVALID_DATE`.
- El frontend ya usa ISO (YYYY-MM-DD) per AGENTS.md. No es regresión.

### EC-4: `rentAmount` con 10 decimales

- `Number(1234.567890123)` no pierde precisión para 13 dígitos.
- MySQL DECIMAL(12,2) trunca a 2 decimales al INSERT.
- El validador no chequea decimales — fuera de scope.

## 5. Technical Contract

### Antes (sin validación)

```
PATCH /api/contracts/:id body={status: "inventado", rentAmount: -100, ...}
  → ensureDefaultOrg()
  → UPDATE contracts SET status='inventado', rent_amount=-100, ... WHERE id=? AND org_id=?
  → MySQL acepta (status es VARCHAR), rent_amount es DECIMAL(12,2) y -100 cabe
  → 200 OK (con datos corruptos)
```

### Después (con validación)

```
PATCH /api/contracts/:id body={status: "inventado", rentAmount: -100, ...}
  → ensureDefaultOrg()
  → validateContractPatch(body) → [{status: INVALID_ENUM}, {rentAmount: NEGATIVE}]
  → 400 {error: "Validation failed", details: [...]}
  → No se toca la DB
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                       | Tipo  | Copy exacto                                                                                     |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| PATCH con status inválido     | error | `Estado del contrato inválido. Valores permitidos: active, ended, pending, cancelled, renewed.` |
| PATCH con rentAmount negativo | error | `El canon no puede ser negativo.`                                                               |
| PATCH con startDate > endDate | error | `La fecha de inicio debe ser anterior a la fecha de fin.`                                       |
| FK violation en propertyId    | error | `La propiedad seleccionada no existe.`                                                          |

## 7. Out of Scope

- Validación con Zod / Joi (sería overkill para 1 endpoint).
- Validar que `endDate > today` (fecha en el pasado).
- Validar que `tenantId` y `propertyId` correspondan al mismo `organizationId`
  (lo hace MySQL FK, pero el error es 500 — caso edge raro).

## 8. Dependencias

- `server/lib/contractValidation.ts` (nuevo, ~50 líneas, 0 deps).
- `entities.ts:319-365` modificado.
- **BUG-029** (ya aplicado): errores se devuelven como JSON.

## 9. Effort

- Helper `validateContractPatch`: 30 min.
- Integración en PATCH: 10 min.
- Test manual con 4-5 casos: 20 min.
- **Total: 1h**

---

**Pendiente de aprobación del usuario.**
