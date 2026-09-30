# Fix #1: requireAuth en router de properties

> **Severidad**: 🔴 P0 — seguridad. Stack: `server/routes/properties.ts`, `server.ts`.

## AC-1: POST /api/properties requiere auth

- Antes de cualquier lógica, llamar `requireAuth` middleware.
- Sin sesión válida → 401 JSON `{error: "No autenticado", code: "NO_SESSION"}`.

## AC-2: GET /api/properties/:id requiere auth

- Mismo comportamiento que AC-1.

## AC-3: GET /api/properties requiere auth

- Mismo.

## AC-4: PATCH /api/properties/:id requiere auth

- Mismo.

## AC-5: DELETE /api/properties/:id requiere auth

- Mismo.

## Out of Scope

- Multi-tenant real (solo auth, no org isolation cross-tenant — eso es issue #2 + futuro).

## Effort

- 5 líneas por endpoint ×5 endpoints = 25 líneas, 0 deps.

---

**Status:** ⏳ Pendiente impl.