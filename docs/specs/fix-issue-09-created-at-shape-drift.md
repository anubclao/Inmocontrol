# Fix #9: appStore.addProperty drift `createdAt` vs `created_at`

> **Severidad**: 🟠 P1. Stack: `src/shared/store/appStore.ts:447-498`.

## AC-1: `addProperty` setea `createdAt` desde server response o ISO actual

- Si `data.created_at` viene del server → usar ese valor.
- Si no → `new Date().toISOString()` (compat con flujo local).

## AC-2: Type `Property` declara `createdAt: string` (no `created_at`)

- Mantener un único nombre en frontend.

## Effort

- 5 líneas, 0 deps.

---

**Status:** ⏳ Pendiente impl.