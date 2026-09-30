# Fix #11: Reemplazar `properties: any[]` por `Property[]`

> **Severidad**: 🟡 P2. Stack: `src/App.tsx:78-90`, `src/features/properties/PropertiesView.tsx:79`, `src/features/tenants/TenantsView.tsx`, otros.

## AC-1: Todos los `properties: any[]` → `properties: Property[]`

- Buscar con grep: `grep -rn "properties: any\[" src/`.

## AC-2: TypeScript strict deja de aceptar `any` para arrays de dominio

- Después del cambio, `tsc --noEmit` puede fallar en sitios que asumían `any`. Hay que corregir esos call sites.

## Effort

- 5-10 archivos tocados, ~20 líneas modificadas.

---

**Status:** ⏳ Pendiente.