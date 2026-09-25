# Fix: PropertiesView <500 líneas (spec #5c)

> **Karpathy Spec** — continuación de specs #5 y #5b.
>
> Tras extraer 5 modales (#5b), PropertiesView.tsx está en 3091
> líneas. El target del spec original (<500) NO se cumplió. Este
> spec #5c planifica las extracciones restantes para llegar al
> target sin romper comportamiento.
>
> Estrategia: extraer state a hooks, modales inline a componentes
> separados, handlers grandes a módulos utils. Cada commit
> atómico + reversible.

## 1. User Story

**As a** developer que agrega features al wizard de captación,
**I want to** que `src/features/properties/PropertiesView.tsx` sea
<500 líneas (solo orquestación de hooks + render de tabla + render
del wizard shell),
**So that** los siguientes cambios (nuevos slots, nuevos estados,
nuevas validaciones) se hagan en archivos dedicados sin navegar
un archivo gigante.

## 2. Acceptance Criteria

### AC-1: `PropertiesView.tsx` queda <500 líneas

- Conteo: `(Get-Content -Raw).Split("\n").Count < 500`.

### AC-2: Hook `useModalsState.ts` para todos los state de modales

- State actual en PropertiesView.tsx:
  - `viewingProperty`
  - `viewingDoc`
  - `inventoryModalProperty` + `inventoryPhase`
  - `comparingProperty`
  - `confirmDiscardDraft`
  - `photoGallery` + `photoGalleryLoading`
  - `wizardPropertyDbId`
  - `showFinalizeSummary`
  - `finalizeSummary` (objeto)
- API:
  ```typescript
  export function useModalsState() {
    return {
      viewingProperty,
      viewingDoc,
      inventoryModal,
      comparingProperty,
      confirmDiscardDraft,
      photoGallery,
      wizardDraft,
      finalizeSummary,
      // ... setters
    };
  }
  ```

### AC-3: Hook `usePropertyActions.ts`

- Encapsula los handlers grandes:
  - `handleFinalize` (~250 LOC)
  - `handleFileChange` (~80 LOC)
  - `handleConfirmDelete` (~30 LOC)
  - `handleDownloadMandato` (~60 LOC)
  - `handleGenerateMandato` (~40 LOC)
- API: `usePropertyActions({ ... })` retorna `{ handleFinalize, handleFileChange, ... }`.

### AC-4: Componente `InventoryModal.tsx` (~120 LOC)

- Modal inline de inventario inicial/final.
- Vive en `src/features/properties/components/InventoryModal.tsx`.
- Props: `{ isOpen, property, phase, onClose, showToast }`.

### AC-5: Componente `CompareInventoriesModal.tsx` (~80 LOC)

- Modal inline de comparativa inicial vs final.
- Props: `{ isOpen, property, onClose, showToast }`.

### AC-6: Componente `ConfirmDeleteModal.tsx` (~70 LOC)

- Modal inline de confirmación de borrado.
- Props: `{ isOpen, property, onConfirm, onCancel }`.

### AC-7: Componente `MandatoUploadModal.tsx` (~60 LOC)

- Modal inline de selección de mandato (upload vs regenerar).
- Props: `{ isOpen, propertyId, onClose, onUpload, showToast }`.

### AC-8: Wizard shell split

- El render del wizard (Step 1, 2, 3) sale a un componente
  `PropertyWizard.tsx` (~400 LOC).
- Props: `{ wizardState, wizardActions, onFinalize, onDiscard }`.
- PropertiesView solo renderiza `<PropertyWizard {...} />` cuando
  el wizard está abierto.

### AC-9: Cero cambio funcional

- Mismo flow de captación (3 pasos).
- Mismas validaciones en cada step.
- Mismas toasts.
- Misma UX de los modales.

### AC-10: Type-check pasa

- `npm run lint` exit 0.
- No se introduce `any` nuevo.

### AC-11: Tests no se rompen

- `npm test` verde.

## 3. Edge Cases

### EC-1 — State compartido entre modales

- El modal de inventario (`inventoryModalProperty`) y el modal de
  galería (`photoGallery`) son state separado pero relacionado (ambos
  muestran contenido de inventario). Consolidar en `useModalsState`
  evita inconsistencias.

### EC-2 — `handleFinalize` toca muchos stores

- El finalize escribe en: appStore (properties), inventoryDB
  (IndexedDB), Drive (server), billing (si status pasa a Arrendado).
- Mover a `usePropertyActions` simplifica el shell pero requiere
  pasar varios callbacks. La firma del hook puede ser larga.

### EC-3 — Wizard state en localStorage

- El wizard persiste state en `STORAGE_KEYS.wizardPropertyDraft`
  (legacy: no por user). Esto NO se refactoriza en este spec (spec
  futuro de draft restoration per-user).

### EC-4 — `finalizeSummary` es data, no UI

- Es un objeto que se renderiza en `FinalizeSummaryModal`.
- Extraerlo del state de modales (es un derivado de `handleFinalize`).
- Mover el builder a `utils/finalizeSummary.ts` (ya existe, ver #5
  Commit 4).

### EC-5 — `handleConfirmDelete` cambia estado de muchos stores

- Borra la propiedad (Zustand) + limpia IndexedDB + Drive folder.
- Mover a `usePropertyActions` con acceso a todos los stores.

### EC-6 — Photo gallery vs Inventory modal

- Ambos se abren desde `viewingProperty` pero tienen state separado.
- Mantener separados (son flujos distintos del user).

## 4. Technical Contract

### Commits planeados (cada uno atómico)

| # | Commit | Líneas extraídas | Total removido |
|---|---|---|---|
| 1 | `refactor(properties): useModalsState hook` | ~100 | -100 |
| 2 | `refactor(properties): extract InventoryModal` | ~120 | -220 |
| 3 | `refactor(properties): extract CompareInventoriesModal` | ~80 | -300 |
| 4 | `refactor(properties): extract ConfirmDeleteModal` | ~70 | -370 |
| 5 | `refactor(properties): extract MandatoUploadModal` | ~60 | -430 |
| 6 | `refactor(properties): usePropertyActions hook` | ~500 | -930 |
| 7 | `refactor(properties): PropertyWizard shell` | ~400 | -1330 |
| 8 | `refactor(properties): remove dead state and dead imports` | ~80 | -1410 |
| | **Total esperado** | | **-1410 → ~1680** |

### Archivos a crear

```
src/features/properties/
  hooks/
    useModalsState.ts
    usePropertyActions.ts
  components/
    InventoryModal.tsx
    CompareInventoriesModal.tsx
    ConfirmDeleteModal.tsx
    MandatoUploadModal.tsx
    PropertyWizard.tsx
```

### Archivos a modificar

- `src/features/properties/PropertiesView.tsx` (consume los hooks, renderiza los componentes).

## 5. Timeouts

- No aplica (es refactor puro).

## 6. Tostadas

Sin cambios.

## 7. Dependencias

- Ninguna nueva.

## 8. Out of Scope

- ❌ Type-erasure de `any` legacy (spec separado).
- ❌ Draft restoration per-user.
- ❌ Wizard state a Zustand (es spec de otro orden).
- ❌ UI primitives consolidation (spec #21).

## 9. Riesgos

| Riesgo | Prob | Imp | Mitigación |
|---|---|---|---|
| Refactor introduce bug | Media | Alta | 1 commit por componente + lint entre cada uno |
| `handleFinalize` muy grande para mover | Media | Media | Split en sub-handlers (`saveInventory`, `uploadToDrive`, `notifyOwner`) |
| State compartido perdido | Baja | Alta | `useModalsState` retorna objeto con TODOS los state, no destructuring |
| PropertyWizard shell demasiado grande | Baja | Media | Step components ya están separados (StepBasic, StepDocs, StepInventory) — el shell solo orquesta |

## 10. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** —

> **Recordatorio Karpathy**: una vez aprobado, sigue
> `tests/verifiers/fix-issue-5c-refactor-properties-view-extract.md`.
> Implementar commit por commit, lint entre cada uno.