# Fix: DELETE contract sin chequeo de dependencias (BUG-012)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-012-delete-contract-fk-409.md`.
>
> **Bug origen**: BUG-012 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/entities.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando intento eliminar un contrato que tiene `amortization_rows` (FK), el server devuelva `409 Conflict` con un mensaje accionable, no `500` con stack trace,
**So that** la UI pueda mostrar "Este contrato tiene pagos registrados. Para eliminarlo, primero anulá los recibos."

## 2. Contexto del bug

### Estado actual (`server/routes/entities.ts:230-255`)

```ts
router.delete("/contracts/:id", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const { id } = req.params;
  try {
    const [result] = await pool.query<any>(
      `DELETE FROM contracts WHERE id = ? AND organization_id = ?`,
      [id, orgId],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Contrato no encontrado" });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[entities/contracts DELETE]", err);
    res
      .status(500)
      .json({ error: err?.message ?? "Error eliminando contrato" });
  }
});
```

### Resultado

Si el contrato tiene `amortization_rows` (FK constraint):

- MySQL rechaza el DELETE con error `1451 - ER_ROW_IS_REFERENCED_2`.
- Express agarra con `catch` genérico → 500 JSON con el mensaje técnico de MySQL.
- UI muestra toast "Cannot delete or update a parent row: a foreign key constraint fails" — inentendible.

## 3. Acceptance Criteria

### AC-1: Detectar `ER_ROW_IS_REFERENCED_2` y devolver 409

- En el `catch` del DELETE, agregar:
  ```ts
  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      error: "No se puede eliminar el contrato porque tiene pagos registrados.",
      hint: "Primero anulá los recibos en el módulo Billing.",
      dependencies: "amortization_rows",
    });
  }
  ```

### AC-2: Pre-check de dependencias (defensa en profundidad)

- ANTES del DELETE, contar `amortization_rows` con `contract_id = ?`:
  ```ts
  const [deps] = await pool.query<any>(
    `SELECT COUNT(*) as n FROM amortization_rows WHERE contract_id = ?`,
    [id],
  );
  if (deps[0]?.n > 0) {
    return res.status(409).json({
      error: "No se puede eliminar el contrato porque tiene pagos registrados.",
      hint: "Primero anulá los recibos en el módulo Billing.",
      dependencies: "amortization_rows",
    });
  }
  ```
- Si `n == 0` → DELETE normal.
- Si `n > 0` → 409 sin tocar la DB.
- Mantiene el catch `ER_ROW_IS_REFERENCED_2` como red de seguridad (cubre
  race conditions donde se insertan pagos entre el SELECT y el DELETE).

### AC-3: Listar las dependencias específicas (no solo el count)

- Ampliar el SELECT para traer las tablas que tienen FK:
  ```ts
  const [deps] = await pool.query<any>(
    `SELECT
        (SELECT COUNT(*) FROM amortization_rows WHERE contract_id = ?) as amort_count,
        (SELECT COUNT(*) FROM rent_invoices WHERE contract_id = ?) as invoice_count`,
    [id, id],
  );
  ```
- Devolver el detalle en el 409:
  ```ts
  return res.status(409).json({
    error: "No se puede eliminar el contrato porque tiene datos asociados.",
    details: {
      amortizationRows: deps[0]?.amort_count ?? 0,
      invoices: deps[0]?.invoice_count ?? 0,
    },
    hint: "Primero anulá los recibos en el módulo Billing.",
  });
  ```

### AC-4: Comportamiento exitoso sin cambios

- DELETE de un contrato SIN dependencias → 200 `{ success: true }` (idéntico).
- DELETE de un contrato inexistente → 404 (idéntico).

## 4. Edge Cases

### EC-1: Contrato existe pero no tiene nada

- Pre-check: `amort_count=0, invoice_count=0` → DELETE → 200.
- Comportamiento idéntico al actual.

### EC-2: Contrato con solo `amortization_rows` (no invoices)

- Pre-check: `amort_count > 0, invoice_count=0` → 409 con detalle.
- UI muestra "tiene N pagos registrados, anulá primero".

### EC-3: Contrato con ambas (amort + invoices)

- Pre-check devuelve ambas counts.
- 409 con detalle de ambas.
- Mismo mensaje de hint (Billing).

### EC-4: Race condition (Pago insertado entre pre-check y DELETE)

- Pre-check: `amort_count=0` → entra al DELETE.
- Otro request inserta una fila en `amortization_rows` para este contrato.
- DELETE tira `ER_ROW_IS_REFERENCED_2`.
- El catch devuelve 409 (red de seguridad). UI no se rompe.

## 5. Technical Contract

### Antes (500 feo)

```
DELETE /api/contracts/CONTRACT_ID
  → DELETE FROM contracts WHERE id = ? AND organization_id = ?
  → MySQL FK violation (1451) si tiene amortization_rows
  → 500 { error: "ER_ROW_IS_REFERENCED_2: Cannot delete or update a parent row..." }
```

### Después (409 accionable)

```
DELETE /api/contracts/CONTRACT_ID
  → SELECT COUNT(*) FROM amortization_rows WHERE contract_id = ?
  → Si n > 0: 409 { error: "...", details: { amortizationRows: N, invoices: M }, hint: "..." }
  → Si n == 0: DELETE contracts → 200 { success: true }
  → Si MySQL FK violation (race): 409 (red de seguridad)
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger               | Tipo    | Copy exacto                                                                                                 |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Contrato con pagos    | error   | `No se puede eliminar el contrato porque tiene 12 pagos registrados. Primero anulá los recibos en Billing.` |
| Contrato con invoices | error   | `No se puede eliminar el contrato porque tiene 3 cuentas de cobro. Primero anulá los recibos en Billing.`   |
| Contrato eliminado OK | success | `Contrato eliminado`                                                                                        |

## 7. Out of Scope

- Cascading delete (borrar contract + sus amort/invoices). Demasiado
  destructivo, debe ser decisión humana.
- Soft delete (marcar `deleted_at` en vez de DELETE físico). Feature
  separada, no un fix.
- Validar que el contrato no esté `status='active'`. Hoy se puede borrar un
  contrato activo sin warning — caso edge que el UX del modal debería
  cubrir (out of scope).

## 8. Dependencias

- `entities.ts:230-255` modificado.
- Sin nuevas deps.

## 9. Effort

- Pre-check + 409: 20 min.
- Test manual con 3 casos: 20 min.
- **Total: 30 min**

---

**Pendiente de aprobación del usuario.**
