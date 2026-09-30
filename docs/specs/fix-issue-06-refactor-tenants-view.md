# Fix #6: Refactor TenantsView.tsx (1983 → <200 por archivo)

> **Severidad**: 🟠 P1. Stack: `src/features/tenants/`.

## AC-1: Estructura target

```
src/features/tenants/
  TenantsView.tsx                       # lista + tabla (~300 líneas)
  modals/
    CreateTenantModal.tsx
    EditTenantModal.tsx
    ViewTenantModal.tsx
  hooks/
    useTenantDrive.ts                   # ensureTenantDriveFolder + refresh
  ActaEntregaModal.tsx                  # ya existe, sin cambios
```

## Effort

- 2 commits × ~1.5h c/u = 3h.

---

**Status:** ⏳ Pendiente.