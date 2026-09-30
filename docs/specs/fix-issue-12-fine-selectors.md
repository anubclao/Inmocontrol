# Fix #12: Selectores finos en App.tsx (re-render performance)

> **Severidad**: 🟡 P2. Stack: `src/App.tsx:78-90`.

## AC-1: Usar `shallow` comparator para reducir re-renders

- Reemplazar `useAppStore((s) => s.properties)` por selectores individuales por componente (Dashboard, Properties, Tenants, etc.).

## Effort

- 1 archivo, ~30 líneas modificadas.

---

**Status:** ⏳ Pendiente.