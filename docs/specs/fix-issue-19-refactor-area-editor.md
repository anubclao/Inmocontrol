# Fix #19: AreaEditor 605 → <250 + 4 subcomponentes

> **Severidad**: 🟢 P3. Stack: `src/features/properties/components/`.
> **Esfuerzo**: ~1h. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`AreaEditor.tsx` (605 líneas) es el editor de un área del wizard de
inventario. Tiene 4 secciones inline grandes:

| Sección                     | Líneas (aprox) | Tipo        |
| --------------------------- | -------------- | ----------- |
| Shell (state + handlers)    | ~100           | inline      |
| Items checklist             | ~200           | extraer     |
| Photos section              | ~80            | extraer     |
| "No aplica" confirm modal   | ~80            | extraer     |
| Photo/video viewer modals   | ~80            | extraer     |
| Header + Progress + Footer  | ~50            | inline      |

## 2. Estado objetivo

```
src/features/properties/components/
├── AreaEditor.tsx                                ~160  shell + render
└── areaEditor/
    ├── useAreaEditor.ts                          ~225  hook con state + handlers
    ├── AreaItemsChecklist.tsx                    ~230  checklist con media
    ├── AreaPhotosSection.tsx                     ~110  fotos generales del área
    ├── RemoveItemModal.tsx                        ~70  confirm "no aplica"
    ├── MediaViewers.tsx                           ~70  visores de foto/video
    └── RemovedItemRow.tsx                         ~40  item colapsado "no aplica"
```

**Total**: 605 → ~160 (AreaEditor) + 6 archivos entre 40-230 líneas.

## 3. Acceptance Criteria

### AC-1: 6 archivos nuevos en `src/features/properties/components/areaEditor/`
- `areaEditor/useAreaEditor.ts` ✓ (hook)
- `areaEditor/AreaItemsChecklist.tsx` ✓
- `areaEditor/AreaPhotosSection.tsx` ✓
- `areaEditor/RemoveItemModal.tsx` ✓
- `areaEditor/MediaViewers.tsx` ✓
- `areaEditor/RemovedItemRow.tsx` ✓

### AC-2: `AreaEditor.tsx` < 250 líneas
Reducción esperada: 605 → ~200 (-67%).

### AC-3: Cada archivo nuevo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: Sin cambios funcionales
- Checklist de items con status (bueno/regular/malo/na) funciona
- Botones "Foto" / "Video" por item funcionan
- Marcar item como "no aplica" abre modal y al confirmar lo oculta
- Subir fotos generales del área funciona
- Visor de foto y video funcionan
- Navegación Atrás/Siguiente/Finalizar funciona
