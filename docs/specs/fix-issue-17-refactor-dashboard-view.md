# Fix #17: DashboardView 324 → <200 + 1 subcomponente

> **Severidad**: 🟢 P3. Stack: `src/features/dashboard/`.
> **Esfuerzo**: ~30 min. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`DashboardView.tsx` (324 líneas) tiene 2 secciones inline que se pueden
extraer limpiamente:

| Sección                        | Líneas (aprox) | Tipo              |
| ------------------------------ | -------------- | ----------------- |
| Stats grid (4 cards) + banners | ~140           | inline en shell   |
| `AlertsModalBody` (función)    | ~120           | extraer a archivo |

## 2. Estado objetivo

```
src/features/dashboard/
├── DashboardView.tsx                          ~200  shell + stats + banners
└── components/
    └── AlertsModalBody.tsx                    ~140  modal de drill-down
```

**Total**: 324 → ~200 (DashboardView) + 1 archivo de ~140 líneas.

## 3. Acceptance Criteria

### AC-1: 1 archivo nuevo en `src/features/dashboard/components/` existe

- `components/AlertsModalBody.tsx` ✓

### AC-2: `DashboardView.tsx` < 220 líneas

Reducción esperada: 324 → ~200 (-38%).

### AC-3: Cada archivo nuevo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: Sin cambios funcionales

- 4 stats cards se ven idénticas
- Botón "Alertas pendientes" abre modal con el mismo contenido
- Botón "Descartar" y "Restaurar todas" funcionan igual
