# Fix #10: formatAddress mutación silenciosa del input

> **Severidad**: 🟠 P1. Stack: `src/utils/validators.ts:42`.

## AC-1: `formatAddress` se renombra a `previewAddressFormat`

- La función pasa a tener nombre explícito.

## AC-2: El input NO se muta automáticamente

- En los call sites, llamar `previewAddressFormat()` solo en preview/display, no en `onChange` del input.

## Effort

- 1 rename + N call sites auditados.

---

**Status:** ⏳ Pendiente impl.