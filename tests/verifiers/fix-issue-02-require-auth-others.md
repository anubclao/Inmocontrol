# Verifier #2: requireAuth en otros routers

## Mismos pasos que verifier #1, aplicado a:

- POST /api/tenants
- GET /api/tenants
- POST /api/billing/policies/:id
- GET /api/billing/policies/:id
- POST /api/inventories
- GET /api/inventories
- POST /api/financial-records
- GET /api/financial-records

Todos sin sesión → **401** JSON.

**Status:** ⏳ Pending