# Fix: markInvoicePaid() sin transacción atómica (BUG-008)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-008-mark-invoice-paid-transaction.md`.
>
> **Bug origen**: BUG-008 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/billing.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando un pago se registra, o se actualizan AMBOS (`amortization_rows` Y `rent_invoices`) o NINGUNO,
**So that** el sistema no quede con la amortización marcada como pagada pero la cuenta de cobro sin actualizar (estado inconsistente que confunde al agente).

## 2. Contexto del bug

### Flujo actual (roto)

`POST /api/billing/payments` (línea ~378-420) hace:

```ts
// Paso 1: UPDATE en amortization_rows (auto-commit)
await pool.query(
  `UPDATE amortization_rows SET status = ?, paid_at = ?, paid_amount = ? WHERE id = ?`,
  [updated.status, updated.paidAt, updated.paidAmount, rowId],
);

// Paso 2: marca el invoice como pagado (auto-commit)
await markInvoicePaid(orgId, propertyId, contractId, period, updated.total);
```

`markInvoicePaid` (línea ~437) internamente hace:

- `SELECT` para ver si existe el invoice
- `UPDATE rent_invoices` o `INSERT` con `status='paid'`

### Resultado

Si el paso 2 falla (MySQL timeout, FK violation, deadlock):

- `amortization_rows.status = 'paid'` ✅
- `rent_invoices.status` sigue en `pending` o no existe ❌

La UI del agente muestra "Pagado" en la tabla de amortización, pero el
PDF de la cuenta de cobro dice "Pendiente" — confusión garantizada.

## 3. Acceptance Criteria

### AC-1: Wrapper `withTransaction(fn)` reutilizable

- Crear `server/lib/withTransaction.ts` que toma una `fn(conn)` y la ejecuta
  dentro de un `pool.getConnection()` + `beginTransaction/commit/rollback`.
- Si `fn` lanza, hace `rollback` y re-throws.
- Si `commit` falla, hace `rollback` y re-throws.

```ts
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
```

### AC-2: `POST /api/billing/payments` usa transacción

- El handler completo (UPDATE `amortization_rows` + UPDATE/INSERT `rent_invoices`)
  se envuelve en `withTransaction`.
- Todos los `pool.query(...)` adentro del handler pasan a `conn.query(...)`.
- Si CUALQUIER query falla → rollback → NINGUNA persiste.

### AC-3: `markInvoicePaid` acepta `PoolConnection` opcional

- Signature: `markInvoicePaid(orgId, propertyId, contractId, period, paidAmount, conn?)`.
- Si `conn` está presente, usa `conn.query` (forma parte de la transacción).
- Si no, usa `pool.query` (modo legacy standalone — para retrocompatibilidad).

### AC-4: Test de rollback manual

- Crear script `scripts/test-008-rollback.mjs` que:
  1. Inserta un amortization_row de prueba.
  2. Llama a `POST /api/billing/payments` con un payload que dispare
     un error intencional en `markInvoicePaid` (e.g. pasar un
     `bank_account_id` inexistente que viole una FK).
  3. Verifica que `amortization_rows.status` SIGUE en su valor previo
     (no se commiteó el UPDATE del paso 1).
  4. Cleanup: borra el row de prueba.

## 4. Edge Cases

### EC-1: `pool.getConnection()` falla (pool exhausted)

- `withTransaction` propaga el error.
- El handler responde 500 JSON (gracias a BUG-029).
- `amortization_rows` no se toca.

### EC-2: `beginTransaction()` falla (MySQL down)

- Mismo comportamiento: rollback no aplica, error propagado, no se toca nada.

### EC-3: `fn` lanza antes del primer query

- `withTransaction` rollback + re-throw. No persistió nada. ✅

### EC-4: `commit()` falla (deadlock detectado por MySQL)

- `withTransaction` rollback + re-throw del error de commit.
- El cliente ve 500 JSON y puede re-intentar.

### EC-5: `fn` tarda >30s (lock de otra transacción)

- `withTransaction` no tiene timeout propio; depende de `pool.query` que sí
  tiene el de MySQL (default `net_read_timeout=30`).
- El cliente ve 500 JSON tras 30s.

## 5. Technical Contract

### Antes (sin transacción)

```ts
router.post("/payments", asyncHandler(async (req, res) => {
  // ... validaciones ...
  await pool.query(`UPDATE amortization_rows ...`);   // ← commit 1
  await markInvoicePaid(...);                          // ← commit 2
  res.json(updated);
}));
```

### Después (con transacción)

```ts
router.post(
  "/payments",
  asyncHandler(async (req, res) => {
    // ... validaciones ...
    const updated = await withTransaction(async (conn) => {
      await conn.query(`UPDATE amortization_rows ...`);
      await markInvoicePaid(
        orgId,
        propertyId,
        contractId,
        period,
        paidAmount,
        conn,
      );
      return updated;
    });
    res.json(updated);
  }),
);
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger               | Tipo    | Copy exacto                                                                             |
| --------------------- | ------- | --------------------------------------------------------------------------------------- |
| Pago registrado OK    | success | `Pago registrado`                                                                       |
| Pago falló (rollback) | error   | `No se pudo registrar el pago. La base de datos está en estado consistente. Reintentá.` |
| Deadlock detectado    | error   | `Conflicto con otra operación. Reintentá.`                                              |

## 7. Out of Scope

- Reintento automático del cliente (el user hace el retry manual).
- Locking pesimista (`SELECT ... FOR UPDATE`) en `amortization_rows`.
- Cambiar el patrón de otros endpoints similares (BUG-006 cubre los más
  críticos). Migración gradual.

## 8. Dependencias

- `server/lib/withTransaction.ts` (nuevo, ~20 líneas, 0 deps).
- `markInvoicePaid` modificado (signature compatible con legacy).
- **BUG-029** (ya aplicado): errores se devuelven como JSON.

## 9. Effort

- Wrapper `withTransaction`: 20 min.
- Modificar `markInvoicePaid` para aceptar `conn?`: 15 min.
- Envolver handler `POST /payments`: 20 min.
- Test de rollback manual: 30 min.
- **Total: 1.5h**

---

**Pendiente de aprobación del usuario.**
