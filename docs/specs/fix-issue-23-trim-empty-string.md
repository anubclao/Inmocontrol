# Fix #23: Trim en validación `!address || !ownerName`

> **Severidad**: 🟢 P3. Stack: `src/features/properties/PropertiesView.tsx:243`.

## AC-1: `""` (string vacío) → rechazado

- Cambiar a `!address?.trim() || !ownerName?.trim()`.

## Effort

- 1 línea.

---

**Status:** ⏳ Pendiente impl.