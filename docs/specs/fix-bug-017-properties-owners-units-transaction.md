# Fix: properties.ts owners/units DELETE+INSERT sin transacción (BUG-017)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-017-properties-owners-units-transaction.md`.
>
> **Bug origen**: BUG-017 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/properties.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando edito los owners/units de una propiedad, o se guardan TODOS los items o NINGUNO,
**So that** la propiedad no quede con un set parcial de owners (e.g. 2 de 3) si el 3er INSERT falla por una validación de MySQL.

## 2. Contexto del bug

### Estado actual (`server/routes/properties.ts:368-376` y siguientes)

```ts
if (Array.isArray(owners)) {
  try {
    const ownerIds: string[] = [];
    await pool.query(`DELETE FROM property_owners WHERE property_id = ?`, [
      propertyId,
    ]);
    for (let i = 0; i < owners.length; i++) {
      // ... validaciones inline ...
      await pool.query(`INSERT INTO property_owners ...`); // ← auto-commit
    }
  } catch (err) {
    console.error("[DB] Error persistiendo property_owners:", err.message);
    // No bloqueamos: la propiedad ya quedó guardada, los owners se pueden
    // re-enviar en otro POST.
  }
}

if (Array.isArray(units)) {
  // ... patrón idéntico ...
}
```

### Resultado

Si 3er INSERT de owners falla:

- DELETE ejecutado (commit) → no hay owners viejos.
- INSERT 1 (commit) → owner 1.
- INSERT 2 (commit) → owner 2.
- INSERT 3 (FAIL) → no se persiste.
- Resultado: la propiedad tiene 2 owners (parcial) cuando debería tener 3 o 0.

El catch actual loguea y "sigue", pero el daño ya está hecho: 2 commits persistidos.

## 3. Acceptance Criteria

### AC-1: Envolver owners en transacción

```ts
if (Array.isArray(owners)) {
  try {
    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM property_owners WHERE property_id = ?`, [
        propertyId,
      ]);
      for (let i = 0; i < owners.length; i++) {
        // ... validaciones inline ...
        await conn.query(`INSERT INTO property_owners ...`); // ← con `conn` no `pool`
      }
    });
  } catch (err: any) {
    console.error("[DB] Error persistiendo property_owners:", err.message);
    return res.status(500).json({
      error: "Error guardando owners. Cambios no aplicados.",
      hint: "Reintentá el POST con el mismo body.",
    });
  }
}
```

### AC-2: Envolver units en transacción (idéntico)

```ts
if (Array.isArray(units)) {
  try {
    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM property_units WHERE property_id = ?`, [
        propertyId,
      ]);
      for (let i = 0; i < units.length; i++) {
        // ... validaciones ...
        await conn.query(`INSERT INTO property_units ...`); // ← con `conn`
      }
    });
  } catch (err: any) {
    console.error("[DB] Error persistiendo property_units:", err.message);
    return res.status(500).json({
      error: "Error guardando units. Cambios no aplicados.",
      hint: "Reintentá el POST con el mismo body.",
    });
  }
}
```

### AC-3: Comportamiento exitoso sin cambios

- Para inserts que funcionan, idéntico al actual.
- Latencia: ~5ms (beginTransaction + commit extra).

### AC-4: 3er INSERT falla → rollback

- DELETE ejecutado dentro de la tx.
- INSERT 1 y 2 dentro de la tx.
- INSERT 3 falla → `withTransaction` rollback → DELETE + INSERT 1 + INSERT 2 deshechos.
- La propiedad queda con los owners VIEJOS intactos.
- Response: 500 con mensaje accionable.

## 4. Edge Cases

### EC-1: DELETE falla (FK violation)

- `withTransaction` rollback → no se inserta nada.
- Response: 500.
- La propiedad conserva sus owners/units viejos.

### EC-2: Owners loop con 0 items

- DELETE se ejecuta (limpia la tabla).
- Loop no itera.
- Commit OK.
- La propiedad queda sin owners. Comportamiento idéntico al actual.

### EC-3: `owners` o `units` son `undefined` (no vienen en el body)

- `Array.isArray(owners)` es `false` → el `if` no se ejecuta.
- La propiedad NO se toca en esas tablas.
- Comportamiento idéntico al actual (PATCH puntual solo de status).

### EC-4: Race condition entre owners y units (un user hace 2 POSTs simultáneos)

- `withTransaction` no aísla entre transacciones. MySQL usa REPEATABLE READ
  por default → cada transacción ve un snapshot.
- Caso edge raro; out of scope.

## 5. Technical Contract

### Antes (sin transacción)

```ts
if (Array.isArray(owners)) {
  try {
    await pool.query(`DELETE FROM property_owners WHERE property_id = ?`); // commit 1
    for (const o of owners) {
      await pool.query(`INSERT INTO property_owners ...`); // commit N
    }
  } catch (err) {
    /* daño persistido */
  }
}
```

### Después (con transacción)

```ts
if (Array.isArray(owners)) {
  try {
    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM property_owners WHERE property_id = ?`); // dentro de tx
      for (const o of owners) {
        await conn.query(`INSERT INTO property_owners ...`); // dentro de tx
      }
    });
  } catch (err) {
    /* rollback automático, nada persistido */
  }
}
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                   | Tipo    | Copy exacto                                                                                        |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Owners/units guardados OK | success | `Propiedades guardadas` (sin cambios)                                                              |
| Owners rollback           | error   | `No se pudieron guardar los propietarios. La base de datos está en estado consistente. Reintentá.` |
| Units rollback            | error   | `No se pudieron guardar las unidades. La base de datos está en estado consistente. Reintentá.`     |

## 7. Out of Scope

- Migrar a upsert con diff (no DELETE+INSERT total). Optimización para futuro.
- Validar que `ownershipPct` sume 100 entre todos los owners. Feature
  separada, no bug.

## 8. Dependencias

- `server/lib/withTransaction.ts` (nuevo, de BUG-008).
- `properties.ts:368-405` (owners) y `properties.ts:407-450` (units).

## 9. Effort

- Wrap owners con withTransaction: 15 min.
- Wrap units con withTransaction: 15 min.
- Test manual con 5 owners + 3 units: 15 min.
- **Total: 45 min**

---

**Pendiente de aprobación del usuario.**
