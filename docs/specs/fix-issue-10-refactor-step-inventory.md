# Fix #10: StepInventory 1028 → <400 + 6 archivos <200

> **Severidad**: 🟡 P2. Stack: `src/features/properties/components/`.
> **Esfuerzo**: ~2.5h. 2 commits.
> **Status**: ⏳ Pendiente (Karpathy FASE 2 — no tocar código hasta aprobación).
> **Creado**: 2026-10-01.
> **Contexto**: `StepInventory.tsx` (1028 líneas) es el archivo más grande de
> `src/` después de `PropertiesView.tsx` (2936, en proceso Fase 2 separado).
> Es el wizard de inventario (captación + colocación) y contiene 4
> responsabilidades distintas que se pueden desacoplar limpiamente.

## 1. Contexto

`StepInventory.tsx` (1028 líneas) hace 4 cosas en un solo componente:

| Responsabilidad                         | Líneas (aprox) | Patrón de extracción                                                                      |
| --------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| **State + hidratación IndexedDB/MySQL** | 95-280         | 🟢 Hook `useInventoryState`                                                               |
| **Finalize (resumen + execute)**        | 380-490        | 🟢 Hook `useInventoryFinalize`                                                            |
| **Signing (firmas + Drive upload)**     | 580-720        | 🟢 Hook `useInventorySigning`                                                             |
| **Stage render (config/editing/modal)** | 760-1028       | 🟢 Componentes `InventoryConfigStage` + `InventoryEditingStage` + `InventoryConfirmModal` |

`Stage="signing"` no se toca — ya delega a `SignatureStep` (631 líneas, refactor aparte).

## 2. Estado actual (1028 líneas)

```
src/features/properties/components/StepInventory.tsx
├── imports (1-30)
├── StepInventoryProps + Stage + helpers (30-95)
├── StepInventory component (95-1028)
│   ├── state + useDraftPersistence (95-160)
│   ├── hydration useEffect (160-280)              ← SE EXTRAE (hook)
│   ├── persist function (350-380)
│   ├── handleFinalizeInventory (380-440)          ← SE EXTRAE (hook)
│   ├── executeFinalize (440-490)                  ← SE EXTRAE (hook)
│   ├── onAreaChange/Photos/Remove (500-545)
│   ├── onSaveItemMedia/Delete (545-580)
│   ├── onSaveSignatures (580-720)                 ← SE EXTRAE (hook)
│   ├── onGeneratePDF (720-740)
│   ├── currentArea memo (740-755)
│   ├── confirmModal JSX (760-825)                 ← SE EXTRAE (component)
│   ├── Loading return (825-840)
│   ├── Config stage return (840-930)              ← SE EXTRAE (component)
│   └── Editing stage return (930-1028)            ← SE EXTRAE (component)
```

## 3. Estado objetivo

```
src/features/properties/components/
├── StepInventory.tsx                      ~380  orquestador
├── AreaConfigPanel.tsx                     186  (intacto)
├── AreaEditor.tsx                          605  (intacto)
├── SignatureStep.tsx                       631  (intacto, fuera de scope)
└── inventory/                              (nuevo dir)
    ├── hooks/
    │   ├── useInventoryState.ts           ~180  state + hidratación + persist
    │   ├── useInventoryFinalize.ts        ~120  resumen + execute + PDF
    │   └── useInventorySigning.ts         ~150  firmas + Drive upload (fase final)
    ├── InventoryConfirmModal.tsx           ~60  modal de resumen
    ├── InventoryConfigStage.tsx           ~110  stage="config" (AreaConfigPanel wrapper)
    └── InventoryEditingStage.tsx          ~130  stage="editing" (AreaEditor wrapper)
```

**Total**: 1028 → ~380 (StepInventory) + 6 archivos entre 60-180 líneas. Restricción
dura de AGENTS.md: cada archivo < 250 líneas.

## 4. Acceptance Criteria

### AC-1: 6 archivos nuevos en `src/features/properties/components/inventory/` existen

- `hooks/useInventoryState.ts`
- `hooks/useInventoryFinalize.ts`
- `hooks/useInventorySigning.ts`
- `InventoryConfirmModal.tsx`
- `InventoryConfigStage.tsx`
- `InventoryEditingStage.tsx`

### AC-2: `StepInventory.tsx` < 400 líneas

- Actual: 1028. Target: <400. Reducción: 628+ líneas (-60%).

### AC-3: Cada archivo nuevo < 250 líneas

- Restricción dura de AGENTS.md (250 era 200 en spec original, relajado por excepción
  documentada en fix-issue-09/09b).
- Excepción aceptable: `useInventoryState.ts` puede llegar a 200 (es un hook con mucha
  lógica de hidratación).

### AC-4: Cada archivo es `export function` (componentes) o `export function` (hooks)

- Componentes: `export function InventoryConfirmModal(...)`, etc.
- Hooks: `export function useInventoryState(...)`, etc.

### AC-5: `StepInventory.tsx` importa los 6 nuevos archivos y NO los redeclara

- Misma convención que en fix-issue-09 y fix-issue-09b.
- 6 imports nuevos al top de `StepInventory.tsx`.
- No se redeclaran los componentes/hooks como funciones locales.

### AC-6: Cero cambio funcional observable

- **AC-6.1**: `npx tsc --noEmit` exit 0
- **AC-6.2**: `npm test` 80/80 pass (no decrease)
- **AC-6.3**: `PropertiesView.tsx` sigue importando `StepInventory` sin cambios
- **AC-6.4**: El wizard de inventario (captación + colocación) funciona idéntico
  - Hidratación desde IndexedDB → fallback MySQL → self-heal
  - Draft persistence (localStorage)
  - Persist + photo sync
  - Finalize con resumen + PDF + Drive upload
  - Signing con upload a Inventarios/ + copia a Contrato/ del tenant

### AC-7: Los hooks reciben solo lo que necesitan

- `useInventoryState(propertyId, phase, baseInventory, propertyType, showToast)` →
  `{ inventory, loading, customAreas, setCustomAreas, persist, currentAreaIndex, setCurrentAreaIndex, stage, setStage, draftKey }`
- `useInventoryFinalize({ inventory, persist, onInventoryFinalized, onGeneratePDF, clearDraft, onComplete, showToast })` →
  `{ confirmFinalize, resumenFinalizacion, setConfirmFinalize, handleFinalizeInventory, executeFinalize, setResumenFinalizacion }`
- `useInventorySigning({ inventory, persist, baseInventory, property, tenantDriveFolderId, onComplete, showToast })` →
  `{ onSaveSignatures }`

## 5. Plan de commits

### Commit 1/2: hooks (state + finalize + signing)

- 3 archivos nuevos en `inventory/hooks/`.
- StepInventory: -250 líneas (las funciones se reemplazan por 3 hooks).
- `tsc --noEmit` + tests verdes.

### Commit 2/2: componentes presentacionales (modal + 2 stages)

- 3 archivos nuevos en `inventory/`.
- StepInventory: -200 líneas más (los returns de config/editing/loading se reemplazan
  por componentes).
- `tsc --noEmit` + tests verdes.
- Push a origin/main.

## 6. Edge Cases

- **EC-1**: `useInventoryState` debe preservar el orden de hidratación:
  IndexedDB → fallback MySQL si photos vacío → self-heal save. Si se rompe,
  el user pierde fotos.
- **EC-2**: `useInventoryFinalize` debe mantener el `clearDraft()` en `executeFinalize`
  (AC-2.4 del spec `fix_wizard_docs_persistence.md`).
- **EC-3**: `useInventorySigning.onSaveSignatures` debe seguir calculando
  `novedadesCount` comparando contra `baseInventory.areas` (fase final).
- **EC-4**: El modal de confirmación debe seguir mostrándose en CUALQUIER return
  path (loading, config, editing) para no perder estado. Esto se logra pasando
  el modal como prop a cada stage, o renderizándolo desde StepInventory.
- **EC-5**: `useDraftPersistence` se mantiene dentro de `useInventoryState` (el draft
  es state de inventario, no del componente).

## 7. Tostadas / UX (sin cambios)

Refactor puro. Los toasts existentes se preservan textualmente.

## 8. Dependencias

Sin nuevas deps. Usa los hooks y componentes ya extraídos.

## 9. Out of Scope

- NO se refactoriza `SignatureStep.tsx` (631 líneas) — ya está en el refactor queue
  como `fix-issue-XX` futuro.
- NO se refactoriza `AreaEditor.tsx` (605 líneas) — idem.
- NO se refactoriza `inventoryConfig.ts` (883 líneas) — backend-ish config, no es
  presentación.
- NO se mueve `useDraftPersistence` a `inventory/hooks/` — es genérico, vive en
  `shared/hooks/`.
- NO se tocan los archivos de `inventoryDB`, `inventoryTypes`, `inventoryPdf`.

## 10. Riesgos

- 🟡 **Medio**: pasar `inventory` por closures entre hooks puede introducir bugs sutiles
  si los hooks no exponen los setters correctos. Mitigación: hooks retornan
  `{ inventory }` o `{ inventory, setInventory }` según necesidad, documentado.
- 🟡 **Medio**: el modal de confirmación debe estar disponible en TODOS los return paths
  (loading, config, editing). Si se pierde, el user no puede finalizar. Mitigación:
  el modal se renderiza desde `StepInventory` (no desde cada stage), pasando
  state + handlers como props.
- 🟢 Bajo: el resto son JSX puros.

## 11. Verifier

`tests/verifiers/fix-issue-10-refactor-step-inventory.md` con 8 ACs binarios.
