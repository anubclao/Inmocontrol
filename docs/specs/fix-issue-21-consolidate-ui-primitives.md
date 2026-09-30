# Fix #21: Consolidar `src/components/ui/` y `src/shared/ui/`

> **Severidad**: 🟢 P3. Stack: `src/components/`, `src/shared/ui/`.

## AC-1: Todos los imports vienen de `src/shared/ui/`

- `grep -rn "components/ui" src/` → 0 referencias.
- `src/components/ui/` borrado o deprecado.

## Effort

- ~20 imports a tocar.

---

**Status:** ⏳ Pendiente.