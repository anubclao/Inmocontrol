# Fix #14: Mover `utils/calculations.ts` a `shared/finance/`

> **Severidad**: 🟡 P2. Stack: `src/utils/calculations.ts` → `src/shared/finance/`.

## AC-1: Mover el archivo (no copiar)

- Crear `src/shared/finance/calculations.ts`.
- Borrar `src/utils/calculations.ts`.

## AC-2: Actualizar todos los imports

- Buscar con grep: `grep -rn "utils/calculations" src/`.
- Reemplazar por `shared/finance/calculations`.

## Effort

- ~30 imports a tocar.

---

**Status:** ⏳ Pendiente.