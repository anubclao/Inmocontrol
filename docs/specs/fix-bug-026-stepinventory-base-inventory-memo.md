# Fix: StepInventory useEffect con baseInventory causa re-load infinito (BUG-026)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-026-stepinventory-base-inventory-memo.md`.
>
> **Bug origen**: BUG-026 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `src/features/properties/components/StepInventory.tsx`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que el wizard de inventario no haga un GET /api/inventories cada vez que se re-renderiza (e.g. al tipear en un campo),
**So that** no se pierdan cambios locales no persistidos (riesgo de pisar el state con datos viejos de MySQL).

## 2. Contexto del bug

### Estado actual (`StepInventory.tsx:82-`)

El useEffect principal hace:

```ts
useEffect(
  () => {
    // ... fetch desde MySQL ...
    // ... hidratar state con baseInventory + remote ...
  },
  [
    /* qué deps? */
  ],
);
```

Si las deps incluyen `baseInventory` directamente, y el padre pasa una
nueva referencia cada render (`<StepInventory baseInventory={someFunc()} />`),
el effect se re-dispara infinitamente.

### Resultado

- Cada keystroke del user en un campo → re-render del padre.
- Padre pasa `baseInventory` con nueva referencia (aunque los datos sean
  idénticos).
- Effect re-dispara → fetch a MySQL → setState → re-render → loop.
- Cambios locales no commiteados pueden ser pisados.

## 3. Acceptance Criteria

### AC-1: Memoizar `baseInventory` con `useMemo` o usar `baseInventory?.id` como dep

```ts
// Opción A: usar solo el id como dep
useEffect(() => {
  // ... fetch ...
}, [baseInventory?.id, phase, propertyId]);

// Opción B: memoizar en el padre
const memoizedBaseInventory = useMemo(() => baseInventory, [baseInventory?.id]);
```

Recomiendo **Opción A** (más simple, no requiere cambios en el padre).

### AC-2: Cambiar la dep de `useEffect` de `baseInventory` a `baseInventory?.id`

```ts
useEffect(() => {
  let cancelled = false;
  (async () => {
    setLoading(true);
    let existing = await inventoryDB.getInventory(inventoryId);
    // ... resto ...
  })();
  return () => {
    cancelled = true;
  };
}, [inventoryId, baseInventory?.id, phase, propertyId]); // ← CAMBIO
```

### AC-3: Comportamiento exitoso sin cambios

- Para wizards con baseInventory inmutable, idéntico al actual.
- Latencia: 0ms (useEffect deps son O(1)).

### AC-4: Verificación con DevTools

- Hard refresh del wizard.
- Abrir DevTools → Performance → grabar 5s mientras tipeo en un campo.
- **Verificar**: solo 1 llamada a `/api/inventories?propertyId=...` (no N).

## 4. Edge Cases

### EC-1: `baseInventory` cambia de ID (caso: user selecciona otro wizard)

- `baseInventory?.id` cambia → effect se re-dispara.
- Fetch el inventario nuevo.
- ✅ OK.

### EC-2: `baseInventory` cambia de referencia pero mismo ID

- `baseInventory?.id` no cambia → effect NO se re-dispara.
- El state local preserva cambios del user.
- ✅ OK (este es el caso que queríamos arreglar).

### EC-3: `baseInventory` es `null` (wizard nuevo)

- `baseInventory?.id` es `undefined`.
- Effect se dispara 1 vez al montar.
- Fetch devuelve 404 (no hay inventario previo) → state vacío.
- ✅ OK.

### EC-4: `baseInventory` se actualiza con un objeto completamente nuevo (caso refresh)

- `baseInventory?.id` cambia → effect se re-dispara.
- Se pierden cambios locales no commiteados.
- Aceptable: el padre no debería pasar un objeto nuevo sin cambiar el id.

## 5. Technical Contract

### Antes (re-carga por referencia)

```ts
useEffect(() => {
  // ... fetch ...
}, [baseInventory, phase, propertyId]); // ← re-carga si cambia la referencia
```

### Después (re-carga por id)

```ts
useEffect(() => {
  // ... fetch ...
}, [baseInventory?.id, phase, propertyId]); // ← re-carga solo si cambia el id
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger         | Tipo      | Copy exacto         |
| --------------- | --------- | ------------------- |
| Cualquier flujo | (ninguno) | (sin cambios de UX) |

## 7. Out of Scope

- Migrar el state local a Zustand para evitar props drilling.
- Memoizar TODO el componente con React.memo.
- Usar React Query / SWR para cachear el fetch.

## 8. Dependencias

- `StepInventory.tsx:82-` useEffect deps.

## 9. Effort

- Cambiar 1 línea (deps array): 2 min.
- Test manual con DevTools Performance: 15 min.
- **Total: 15 min**

---

**Pendiente de aprobación del usuario.**
