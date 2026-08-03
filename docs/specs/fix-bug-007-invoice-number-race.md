# Fix: race condition en generateInvoiceNumber (BUG-007)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-007-invoice-number-race.md`.
>
> **Bug origen**: BUG-007 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/billing.ts`, `db/mysql/migrations/`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que dos POSTs simultáneos a `/api/billing/invoices/send` (mismo property + period) generen consecutivos distintos (CC-YYYYMM-NNN vs CC-YYYYMM-NNN+1),
**So that** no se creen dos `rent_invoices` con el mismo `invoice_number` y la trazabilidad de cuentas de cobro siga siendo confiable.

## 2. Contexto del bug

### Patrón roto (server/routes/billing.ts:825-841)

```ts
async function generateInvoiceNumber(orgId, propertyId, period) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM rent_invoices
     WHERE organization_id = ? AND property_id = ? AND period = ?`,
    [orgId, propertyId, period],
  );
  const n = Number(rows[0]?.n ?? 0) + 1;
  return `CC-${period.replace("-", "")}-${String(n).padStart(3, "0")}`;
}
```

### Resultado

Race condition clásica de **read-then-write**:

1. POST #1 lee `COUNT = 0` → `n = 1` → genera `CC-YYYYMM-001`.
2. POST #2 (simultáneo) lee `COUNT = 0` → `n = 1` → también genera `CC-YYYYMM-001`.
3. Ambos INSERT sin colisión (no hay UNIQUE) → quedan 2 invoices con el mismo `invoice_number`.

### Impacto

- Numeración duplicada: dos cuentas de cobro físicas con el mismo #.
- El PDF generado por cada uno dice "CC-202607-001" → el inquilino paga una,
  el owner cree que la otra está impaga.
- Trazabilidad rota.

## 3. Acceptance Criteria

### AC-1: Crear migration 011 con UNIQUE constraint

- Nueva migración `db/mysql/migrations/011_invoice_number_unique.sql`:
  ```sql
  -- Idempotente: si ya hay duplicados, falla con mensaje claro.
  -- Antes de aplicar, correr: SELECT property_id, period, invoice_number, COUNT(*)
  -- FROM rent_invoices GROUP BY 1,2,3 HAVING COUNT(*) > 1;
  ALTER TABLE rent_invoices
    ADD UNIQUE KEY rent_invoices_unique_invoice_number
    (organization_id, property_id, period, invoice_number);
  ```
- Aplicar con `scripts/apply-011-migration.mjs` (chequea duplicados antes).
- Actualizar `schema-completo.sql` y `schema-hostinger.sql` con el constraint.

### AC-2: Función `generateInvoiceNumber` reescrita sin race

- Patrón: loop con retry on duplicate key, hasta 5 intentos.
- Si después de 5 intentos sigue fallando → error 500 con mensaje claro.

```ts
async function generateInvoiceNumber(
  orgId,
  propertyId,
  period,
): Promise<string> {
  const periodCompact = period.replace("-", "");
  for (let attempt = 1; attempt <= 5; attempt++) {
    // 1. Contar facturas existentes para ESTE property+period
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM rent_invoices
       WHERE organization_id = ? AND property_id = ? AND period = ?
         AND invoice_number IS NOT NULL`,
      [orgId, propertyId, period],
    );
    const n = Number((rows as any[])[0]?.n ?? 0) + attempt;
    const candidate = `CC-${periodCompact}-${String(n).padStart(3, "0")}`;

    // 2. Verificar que `candidate` no exista (defensa contra gaps en la serie)
    const [existing] = await pool.query(
      `SELECT 1 FROM rent_invoices
       WHERE organization_id = ? AND property_id = ? AND period = ?
         AND invoice_number = ?`,
      [orgId, propertyId, period, candidate],
    );
    if ((existing as any[]).length === 0) {
      return candidate;
    }
    // Si existe, race condition: otro INSERT ganó. Retry con n+1.
  }
  throw new Error(
    `generateInvoiceNumber: 5 intentos agotados para ${orgId}/${propertyId}/${period}`,
  );
}
```

### AC-3: INSERT con manejo de UNIQUE violation

- En `POST /api/billing/invoices/send`, el INSERT a `rent_invoices` debe
  manejar `ER_DUP_ENTRY` (MySQL code 1062) y re-intentar el flujo desde
  `generateInvoiceNumber`.

### AC-4: Idempotencia

- Si el agente hace 2 clicks rápidos en "Enviar CC" (caso de UI lenta),
  el backend genera UN solo `invoice_number` y UN solo `rent_invoices` row.
- El segundo click responde con el mismo `invoice_number` (idempotente).

## 4. Edge Cases

### EC-1: No hay invoices previas

- `COUNT = 0` → `n = 1` → `CC-YYYYMM-001` (comportamiento actual).

### EC-2: Hay 5 invoices previas, sin gaps

- `COUNT = 5` → `n = 6` → `CC-YYYYMM-006` (comportamiento actual).

### EC-3: Hay 5 invoices pero un gap (e.g. 001, 002, 004, 005, 006)

- `COUNT = 5` → `n = 6` → `CC-YYYYMM-006` ya existe → re-intenta con `n+1` → `007`.
- Encuentra el siguiente hueco. Continúa con la serie.

### EC-4: 10 POSTs simultáneos (stress test)

- Solo 1 INSERT gana por iteración del loop. Los otros 9 retry con `n+1`.
- Después de 10 retries, todos tienen `invoice_number` distinto.
- Si se acaban los retries (caso extremo de 10+ simultáneos), devuelve 500.

### EC-5: `invoice_number` es NULL (caso pre-004 migration)

- El filtro `AND invoice_number IS NOT NULL` excluye estos.
- Si la mayoría de filas tienen NULL, el `COUNT` devuelve las no-NULL.
- Comportamiento esperado: la numeración empieza desde 001 para los nuevos.

## 5. Technical Contract

### Antes (con race)

```
POST /api/billing/invoices/send  (req: {propertyId, contractId, period})
  → ensureDefaultOrg()
  → generateInvoiceNumber()       ← COUNT+1 (no atómico)
  → INSERT INTO rent_invoices
```

### Después (con UNIQUE + retry)

```
POST /api/billing/invoices/send  (req: {propertyId, contractId, period})
  → ensureDefaultOrg()
  → loop hasta 5 veces:
      → generateInvoiceNumber()   ← COUNT+attempt, verifica que no exista
      → INSERT INTO rent_invoices  (si ER_DUP_ENTRY → next iteration)
  → res.json({ invoiceNumber, id })
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                                         | Tipo    | Copy exacto                                                                              |
| ----------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| 2 clicks rápidos en "Enviar CC"                 | success | `Cuenta de cobro enviada` (solo 1 toast, no 2)                                           |
| 5 reintentos agotados                           | error   | `No se pudo generar el consecutivo. Reintentá.`                                          |
| Migration 011 detecta duplicados pre-existentes | error   | `Hay N cuentas de cobro con número duplicado. Resolvelas antes de aplicar la migration.` |

## 7. Out of Scope

- Cambiar el formato de `invoice_number` (sigue `CC-YYYYMM-NNN`).
- Locking pesimista con `SELECT ... FOR UPDATE` (sería overkill).
- Re-numerar facturas existentes (caso de gap manual).

## 8. Dependencias

- **BUG-032** (Ola 3): también pide UNIQUE en `invoice_number`. Este fix
  implementa AMBOS en una sola migration (011).
- Sin nuevas deps.

## 9. Effort

- Spec: 1h (hecho).
- Migration 011 + script apply: 30 min.
- Reescribir `generateInvoiceNumber`: 30 min.
- Tests (manual con 5 POSTs simultáneos via xargs): 30 min.
- **Total: 1.5h**

---

**Pendiente de aprobación del usuario.**
