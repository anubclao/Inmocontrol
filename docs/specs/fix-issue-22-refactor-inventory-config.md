# Fix #22: inventoryConfig.ts 883 → split por dominio (10 archivos <250)

> **Severidad**: 🟡 P2. Stack: `src/features/properties/`.
> **Esfuerzo**: ~1h. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`src/features/properties/inventoryConfig.ts` (883 líneas) es la
configuración declarativa del Inventario Dinámico. Contiene:

- Tipos y enums (PropertyType, ItemStatus, ITEM*STATUS*\*, ItemDef)
- ITEM_CATALOG con 35+ categorías (508 líneas)
- PROPERTY_TYPES con 6 tipos de inmueble (200 líneas)
- MATERIAL_CATALOG (115 líneas)
- resolveAreas helper (50 líneas)

## 2. Estado objetivo

```
src/features/properties/
├── inventoryConfig.ts                          ~30  barrel re-export (compat)
└── inventoryConfig/
    ├── types.ts                                ~35  tipos y enums
    ├── itemCatalog.ts                          ~35  combiner de ITEM_CATALOG
    ├── itemCatalogSocial.ts                   ~200  entrada, hall, pasillo, salas, balcones, patio
    ├── itemCatalogBanosYcocina.ts             ~150  3 baños + cocina
    ├── itemCatalogHabitaciones.ts             ~130  alcoba, estudio, depósito, lavandería
    ├── itemCatalogComercial.ts                ~110  comercial + otros
    ├── propertyTypes.ts                       ~225  PROPERTY_TYPES + getPropertyTypeConfig
    ├── materialCatalog.ts                     ~120  MATERIAL_CATALOG
    └── resolveAreas.ts                         ~55  resolveAreas helper
```

**Total**: 883 → ~30 (barrel) + 9 archivos entre 35-225 líneas.

## 3. Acceptance Criteria

### AC-1: 9 archivos nuevos en `src/features/properties/inventoryConfig/`

- `types.ts` ✓
- `itemCatalog.ts` ✓
- `itemCatalogSocial.ts` ✓
- `itemCatalogBanosYcocina.ts` ✓
- `itemCatalogHabitaciones.ts` ✓
- `itemCatalogComercial.ts` ✓
- `propertyTypes.ts` ✓
- `materialCatalog.ts` ✓
- `resolveAreas.ts` ✓

### AC-2: `inventoryConfig.ts` < 50 líneas (barrel)

### AC-3: Cada archivo nuevo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: 14 importadores externos sin cambios
