# Fix #3: DB_PASSWORD hard-fail en producción

> **Severidad**: 🔴 P0. Stack: `server/db.ts`.

## AC-1: Si NODE_ENV=production && DB_PASSWORD vacío → process.exit(1)

- Agregar check al inicio de `server/db.ts` (después de dotenv).
- Mensaje claro: "DB_PASSWORD no configurado. Definilo en el panel de Hostinger antes de continuar."

## AC-2: En development, comportamiento actual (fallback a '')

- Mantener compat con dev local sin password.

## Effort

- 5 líneas, 0 deps.

---

**Status:** ⏳ Pendiente impl.