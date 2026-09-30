# Fix #17: IndexedDB cache rejected forever

> **Severidad**: 🟡 P2. Stack: `src/features/properties/inventoryDB.ts:20-37`.

## AC-1: Si `openDB()` falla, reintentar en el próximo `getInventory`

- Resetear `dbPromise = null` en el `onerror`.

## AC-2: Manejar error con try/catch en cada tx

- Si `tx` rechaza, no romper la app — log warning.

## Effort

- 10 líneas, 0 deps.

---

**Status:** ⏳ Pendiente impl.