# Fix #2: requireAuth en routers tenants/billing/inventories/financialRecords

> **Severidad**: 🔴 P0. Stack: `server/routes/{tenants,billing,inventories,financialRecords}.ts`.

## AC-1: Todos los endpoints requieren auth

- Mismo patrón que issue #1: wrappear cada router con `requireAuth`.
- Excluir solo `/api/health` y `/api/auth/login`.

## Effort

- 4 routers × 5-15 endpoints c/u = ~30 líneas, 0 deps.

---

**Status:** ⏳ Pendiente impl.