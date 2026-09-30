# Fix #15: Auditar aplicación de migración 009

> **Severidad**: 🟡 P2. Stack: `db/mysql/migrations/009_properties_inventory_pdf_urls.sql`.

## AC-1: Existe `scripts/apply-009-migration.mjs`

- Buscar con `ls scripts/apply-*` → confirmar.

## AC-2: Documentar estado real

- Agregar a `DEPLOY.md` o `db/mysql/MIGRATIONS.md` qué migraciones están aplicadas en prod.

## Effort

- 1 archivo nuevo o nota.

---

**Status:** ⏳ Pendiente investigación.