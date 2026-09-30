# Fix #13: handleAddProperty silent fetch fail

> **Severidad**: 🟡 P2. Stack: `src/App.tsx:325-357`.

## AC-1: Si el refetch a `/api/properties/:id` falla → toast warning

- Reemplazar `.catch(() => {})` por `.catch((e) => showToast(...))`.

## Effort

- 5 líneas, 0 deps.

---

**Status:** ⏳ Pendiente.