# Fix #14: PropertyDetailModal 836 → <200 + 6 archivos <250

> **Severidad**: 🟢 P3. Stack: `src/features/properties/components/`.
> **Esfuerzo**: ~1h. 1 commit.
> **Status**: ✅ Completado.

## 1. Contexto

`PropertyDetailModal.tsx` (836 líneas) es un modal monolítico con 6
secciones inline que se pueden extraer limpiamente:

| Sección                    | Líneas (aprox) |
| -------------------------- | -------------- |
| Header (dirección, status) | ~110           |
| Owners                     | ~110           |
| Units                      | ~98            |
| PropertyDocs               | ~92            |
| Contracts                  | ~122           |
| InventoryActions           | ~130           |

## 2. Estado objetivo

```
src/features/properties/components/
├── PropertyDetailModal.tsx                 ~120  shell
└── detailModal/                            (nuevo dir)
    ├── HeaderSection.tsx                  ~170
    ├── OwnersSection.tsx                   ~90
    ├── UnitsSection.tsx                   ~105
    ├── PropertyDocsSection.tsx            ~110
    ├── ContractsSection.tsx               ~120
    └── InventoryActionsSection.tsx        ~110
```

**Total**: 836 → ~120 (PropertyDetailModal) + 6 archivos entre 90-170 líneas.

## 3. Acceptance Criteria

### AC-1: 6 archivos nuevos en `src/features/properties/components/detailModal/`

### AC-2: `PropertyDetailModal.tsx` < 200 líneas

### AC-3: Cada archivo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: Sin cambios funcionales (el modal se ve idéntico)
