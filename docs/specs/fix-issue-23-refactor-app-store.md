# Fix #23: appStore.ts 640 → split en slices por dominio (7 archivos <250)

> **Severidad**: 🟡 P2 (crítico, no rompe nada). Stack: `src/shared/store/`.
> **Esfuerzo**: ~1h. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`src/shared/store/appStore.ts` (640 líneas) es el store global de
Zustand. Contiene: type AppState (interfaz), apiCall helper, initialState,
y 13 acciones (CRUD de properties/tenants/financial + hydrate + fetch + reset).

## 2. Estado objetivo

```
src/shared/store/
├── appStore.ts                                  ~30  barrel re-export (compat)
└── appStore/
    ├── types.ts                                 ~80  AppState interface
    ├── api.ts                                   ~45  apiCall helper + initialState
    ├── selectors.ts                             ~10  selectProperties, etc.
    ├── slices/
    │   ├── propertiesCrudSlice.ts              ~150  addProperty, updateProperty, removeProperty
    │   ├── propertiesFetchSlice.ts             ~120  fetchProperties + invalidate + setLastCreated
    │   ├── tenantsSlice.ts                      ~95  addTenant, updateTenant, removeTenant
    │   ├── financialSlice.ts                    ~60  addFinancialRecord, update, remove
    │   └── hydrateSlice.ts                     ~180  hydrate (5 endpoints + mappers + sync)
```

**Total**: 640 → ~30 (barrel) + 6 archivos entre 10-180 líneas.

## 3. Acceptance Criteria

### AC-1: 8 archivos nuevos en `src/shared/store/appStore/` + `slices/`

- `types.ts` ✓
- `api.ts` ✓
- `selectors.ts` ✓
- `slices/propertiesCrudSlice.ts` ✓
- `slices/propertiesFetchSlice.ts` ✓
- `slices/tenantsSlice.ts` ✓
- `slices/financialSlice.ts` ✓
- `slices/hydrateSlice.ts` ✓

### AC-2: `appStore.ts` < 50 líneas (barrel + create())

### AC-3: Cada archivo nuevo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: 15+ importadores externos sin cambios
