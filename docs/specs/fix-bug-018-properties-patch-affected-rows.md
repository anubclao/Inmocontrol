# Fix: PATCH /api/properties/:id devuelve 200 aunque affectedRows=0 (BUG-018)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-018-properties-patch-affected-rows.md`.
>
> **Bug origen**: BUG-018 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/properties.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando hago PATCH a una propiedad que NO existe, el server devuelva 404 (no 200),
**So that** mi UI detecte el error y muestre "Propiedad no encontrada" en vez de actualizar el cache local con un éxito mentiroso.

## 2. Contexto del bug

### Estado actual (`server/routes/properties.ts:910-920`)

```ts
try {
  const orgId = await ensureDefaultOrg();
  await pool.query(
    `UPDATE properties SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
    [...values, orgId],
  );
  res.json({ success: true }); // ← siempre 200, sin chequear affectedRows
} catch (err: any) {
  res.status(500).json({ error: err.message });
}
```

### Resultado

PATCH a una propiedad inexistente:

1. MySQL ejecuta `UPDATE properties SET ... WHERE id = 'inexistente' AND org_id = 'X'`.
2. `affectedRows = 0` (ninguna fila matchea).
3. El handler devuelve `200 { success: true }`.
4. Frontend cree que actualizó.
5. Zustand store actualiza con valores nuevos.
6. Al refrescar, el GET no la trae (no existe). El estado se desincroniza.

## 3. Acceptance Criteria

### AC-1: Chequear `result.affectedRows` y devolver 404 si 0

```ts
const [result] = await pool.query(
  `UPDATE properties SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
  [...values, orgId],
);
if (result.affectedRows === 0) {
  return res.status(404).json({
    error: "Propiedad no encontrada o no pertenece a esta organización",
  });
}
res.json({ success: true });
```

### AC-2: Caso edge — UPDATE con valores idénticos

- Si los valores del body son IDÉNTICOS a los actuales, MySQL devuelve
  `affectedRows = 0` PERO la fila SÍ existe.
- Distinguir:

  ```ts
  // affectedRows = 0 puede significar:
  //   a) La fila no existe (404)
  //   b) La fila existe pero los valores son idénticos (200, no-op)

  // Para distinguirlas, hacer un SELECT previo:
  const [exists] = await pool.query<any[]>(
    `SELECT 1 FROM properties WHERE id = ? AND organization_id = ? LIMIT 1`,
    [id, orgId],
  );
  if (!exists.length) {
    return res.status(404).json({ error: "Propiedad no encontrada" });
  }
  // La fila existe → 200 (puede ser no-op si los valores son idénticos)
  res.json({ success: true });
  ```

- Esto es 1 query extra (SELECT antes del UPDATE) — aceptable.

### AC-3: Comportamiento exitoso sin cambios

- Para PATCH que SÍ actualiza, idéntico al actual (200 con success).
- Latencia: 1 query extra (~2ms).

## 4. Edge Cases

### EC-1: PATCH a propiedad de otro org

- `WHERE id = ? AND org_id = ?` filtra. affectedRows=0.
- 404 con mensaje "no encontrada o no pertenece a esta organización".
- No filtra información sobre si existe en otro org.

### EC-2: PATCH con body vacío (solo `Nothing to update`)

- El handler ya tiene el early-return: `if (!updates.length) { res.json({ success: true, message: 'Nothing to update' }); return; }`.
- Este caso no llega al UPDATE. No es bug.

### EC-3: PATCH con campos que no existen en el schema

- El `allowed` array filtra los campos antes de generar el UPDATE.
- Si el body trae un campo no permitido, se ignora silenciosamente.
- `updates` puede quedar con 0 items → early-return.
- No es bug.

### EC-4: MySQL acepta el UPDATE pero rechaza por FK

- `catch (err)` agarra → 500 JSON (vía BUG-029).
- No es bug.

## 5. Technical Contract

### Antes (200 siempre)

```
PATCH /api/properties/inexistente
  → UPDATE properties SET ... WHERE id = 'inexistente' AND org_id = ?
  → affectedRows = 0
  → 200 { success: true }  ← MENTIRA
```

### Después (404 si no existe)

```
PATCH /api/properties/inexistente
  → SELECT 1 FROM properties WHERE id = 'inexistente' AND org_id = ? LIMIT 1
  → rows = []
  → 404 { error: 'Propiedad no encontrada' }
```

```
PATCH /api/properties/existente
  → SELECT 1 → rows = [1]
  → UPDATE ... affectedRows = 1 (o 0 si valores idénticos)
  → 200 { success: true }
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                       | Tipo    | Copy exacto                                                  |
| ----------------------------- | ------- | ------------------------------------------------------------ |
| PATCH a propiedad existente   | success | `Propiedad actualizada` (sin cambios)                        |
| PATCH a propiedad inexistente | error   | `Propiedad no encontrada o no pertenece a esta organización` |

## 7. Out of Scope

- Devolver la fila actualizada en la response (PATCH /resource típicamente devuelve el resource).
- Idempotency keys.
- Soportar PATCH a múltiples propiedades a la vez.

## 8. Dependencias

- `properties.ts:910-918` modificado.

## 9. Effort

- Pre-check SELECT + chequeo affectedRows: 10 min.
- Test manual: 5 min.
- **Total: 15 min**

---

**Pendiente de aprobación del usuario.**
