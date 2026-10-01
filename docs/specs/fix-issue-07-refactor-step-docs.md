# Fix #7: Refactor StepDocs.tsx (814 → <200 por archivo)

> **Severidad**: 🟠 P1. Stack: `src/features/properties/components/StepDocs.tsx`.
> **Esfuerzo**: ~1.5h. 1 commit (5 archivos nuevos, 1 eliminado).
> **Status**: ⏳ Pending Review (Karpathy FASE 2 — no tocar código hasta aprobación).
> **Actualizado**: 2026-09-30. Removidos los 3 modales que no existen en el código actual (eran placeholders del spec viejo).

## Contexto

`StepDocs.tsx` (814 líneas, antes 843) es el segundo paso del wizard de propiedades (5 documentos legales). Contiene:

- 5 funciones puras (helpers sin estado): `getDocStorageState`, `labelForKey`, `countInSlot`, `buildRequiredSlots`, y un `iconForKey` inline en `StepDocs` (líneas 258-260)
- 1 componente principal `StepDocs` (443 líneas, líneas 214-656)
- 1 sub-componente `DocCard` (157 líneas, líneas 657-814)
- 16 imports de iconos (lucide-react)

**Violación AGENTS.md**: "Componentes bajo 200 líneas" — `StepDocs` tiene 443 líneas y el archivo total 814.

**Nota sobre modales**: el spec original (1 línea) mencionaba `ConfirmContinueModal`, `UploadAnotherDocModal`, `IdNumberModal`. **Esos modales no existen en el código actual** — son placeholders de un refactor previo que nunca se completó. Los omito de este spec.

## 1. User Story

**As a** desarrollador de InmoControl,
**I want to** que el archivo `StepDocs.tsx` tenga menos de 200 líneas, con la lógica de slots/iconos en un hook y el componente `DocCard` en su propio archivo,
**So that** (a) cumpla la regla AGENTS.md de "componentes <200 líneas", (b) la lógica pura sea testable unitariamente, y (c) sea más fácil encontrar código al hacer grep (`StepDocs` no es un archivo de 800 líneas).

## 2. Estado actual (estructura)

```
src/features/properties/components/StepDocs.tsx (814 líneas)
├── imports (lines 1-23)
├── DocStorageState type (30-34)            # 5 líneas
├── getDocStorageState() (36-48)           # 13 líneas, pura
├── DocSlotKey type (50-59)                 # 10 líneas
├── UploadedDocsMap type (62)               # 1 línea
├── labelForKey() (65-90)                   # 26 líneas, pura
├── StepDocsProps interface (92-125)        # 34 líneas
├── countInSlot() (127-132)                 # 6 líneas, pura
├── buildRequiredSlots() (134-212)          # 79 líneas, pura
├── StepDocs component (214-656)           # 443 líneas
│   └── iconForKey switch inline (258-260)  # 3 líneas, pura
└── DocCard component (657-814)            # 157 líneas (sub-componente)
```

## 3. Aceptación

### AC-1: Estructura target

```
src/features/properties/components/StepDocs/
├── index.tsx                  # shell que re-exporta StepDocs (default export)
├── StepDocs.tsx               # componente principal <200 líneas
├── DocCard.tsx                # sub-componente <200 líneas
├── types.ts                   # DocStorageState, DocSlotKey, UploadedDocsMap, StepDocsProps, DocCardProps
└── hooks/
    └── useDocCards.ts         # 5 funciones puras (buildRequiredSlots, iconForKey, labelForKey, countInSlot, getDocStorageState)
```

### AC-2: `StepDocs.tsx` < 200 líneas

- El componente principal `StepDocs` (función exportada) está en `StepDocs/StepDocs.tsx` con < 200 líneas.
- El shell `index.tsx` es un re-export de una sola línea:
  ```typescript
  export { StepDocs as default } from "./StepDocs";
  ```
- **Total de líneas en `StepDocs.tsx`**: < 200.

### AC-3: `DocCard.tsx` separado

- El sub-componente `DocCard` se mueve a su propio archivo `DocCard.tsx` con su `interface DocCardProps`.
- Importa los types desde `./types` (no duplica definitions).
- Las funciones puras (`getDocStorageState`, `iconForKey`) vienen del hook.

### AC-4: Hook `useDocCards` con funciones puras

- `src/features/properties/components/StepDocs/hooks/useDocCards.ts` exporta las 5 funciones:
  - `buildRequiredSlots(...)` (movido desde línea 134)
  - `labelForKey(...)` (movido desde línea 65)
  - `countInSlot(...)` (movido desde línea 127)
  - `getDocStorageState(...)` (movido desde línea 36)
  - `iconForKey(slotKey, group, unitId, units)` (NUEVO — extraído del switch inline en `StepDocs` líneas 256-267 del original; ahora recibe `units: WizardUnit[]` para resolver el tipo de unidad y devolver `Car`/`Package`/`Box` según corresponda)
- El "hook" **no es un React hook real** (no usa `useState`/`useEffect`); es un módulo de funciones puras exportadas individualmente. El nombre `useDocCards` se mantiene por consistencia con el spec original.

### AC-5: `types.ts` centraliza los types

- `DocStorageState`, `DocSlotKey`, `UploadedDocsMap`, `StepDocsProps`, `DocCardProps` se mueven a `types.ts`.
- `StepDocs.tsx`, `DocCard.tsx`, y `useDocCards.ts` los importan desde `./types` (o `../types`).
- **No hay type duplicado** entre los 4 archivos.

### AC-6: Imports limpios

- `StepDocs.tsx` no importa `lucide-react` (los icons vienen del hook).
- `DocCard.tsx` solo importa los icons que usa.

### AC-7: Cero cambio funcional observable

- `git diff --no-index` del output de las funciones puras debe ser idéntico al original.
- Los 814 - 200 = 614+ líneas que se sacan del archivo principal **se mueven** a otros archivos, no se borran.
- El wizard de propiedades sigue funcionando end-to-end.

### AC-8: Re-export backward-compatible

- `import StepDocs from "../components/StepDocs"` (que es como lo importan los callers) sigue funcionando porque `StepDocs/` es la convención de resolución de Node (busca `StepDocs/index.tsx`).

## 4. Edge Cases

### E-1: El monolito `StepDocs.tsx` y la carpeta `StepDocs/` no pueden coexistir

- Si quedan ambos, los imports son ambiguos. **El monolito se ELIMINA** después de confirmar que los nuevos archivos compilan.

### E-2: Path de import para types cambia

- `import { DocStorageState } from "../components/StepDocs"` → **rompe** porque ya no se exporta desde ahí.
- Hay que actualizar a `../components/StepDocs/types` o `../components/StepDocs/hooks/useDocCards`.

### E-3: tsc + module resolution

- El proyecto usa Vite. El bundle de Vite resuelve `StepDocs` → `StepDocs/index.tsx`. tsc también lo resuelve.
- **Verificación**: tsc --noEmit debe pasar.

### E-4: Bundle size

- El refactor **no debe aumentar el bundle**. Mover código entre archivos del mismo package no debería afectar tree-shaking.
- **Verificación**: `npm run build:client` antes y después — tolerancia ±5 KB.

## 5. Technical Contract

### Archivos creados

```typescript
// src/features/properties/components/StepDocs/types.ts (~50 líneas)
export type DocStorageState = "drive" | "local" | "pending";
export type DocSlotKey = /* ... */;
export type UploadedDocsMap = Record<string, string[]>;
export interface StepDocsProps { /* ... */ }
export interface DocCardProps { /* ... */ }
```

```typescript
// src/features/properties/components/StepDocs/hooks/useDocCards.ts (~150 líneas)
import { Car, Package, Box /* ... */ } from "lucide-react";
export function iconForKey(slotKey: string, unitType?: string): LucideIcon {
  /* extraido de StepDocs 258-260 */
}
export function buildRequiredSlots(/* ... */): DocSlotKey[] {
  /* movido desde 134-212 */
}
export function labelForKey(slotKey: string): string {
  /* movido desde 65-90 */
}
export function countInSlot(map: UploadedDocsMap, slotKey: string): number {
  /* movido desde 127-132 */
}
export function getDocStorageState(url: string): DocStorageState {
  /* movido desde 36-48 */
}
```

```typescript
// src/features/properties/components/StepDocs/StepDocs.tsx (~180 líneas)
import {} from /* lo que necesita */ "./hooks/useDocCards";
import { DocCard } from "./DocCard";
import type { StepDocsProps } from "./types";

export function StepDocs(props: StepDocsProps) {
  /* ... */
}
```

```typescript
// src/features/properties/components/StepDocs/DocCard.tsx (~170 líneas)
import {} from /* icons selectivos */ "lucide-react";
import { getDocStorageState } from "./hooks/useDocCards";
import type { DocCardProps } from "./types";

export function DocCard(props: DocCardProps) {
  /* ... */
}
```

```typescript
// src/features/properties/components/StepDocs/index.tsx (1 línea)
export { StepDocs as default } from "./StepDocs";
```

## 6. Timeouts explícitos

- **N/A**. Este refactor no agrega llamadas externas.

## 7. Tostadas exactas (copy approved)

> **N/A**. No se agregan toasts ni se cambia copy.

## 8. Dependencias

### Archivos a crear (5)

- `src/features/properties/components/StepDocs/index.tsx`
- `src/features/properties/components/StepDocs/StepDocs.tsx`
- `src/features/properties/components/StepDocs/DocCard.tsx`
- `src/features/properties/components/StepDocs/types.ts`
- `src/features/properties/components/StepDocs/hooks/useDocCards.ts`

### Archivos a eliminar (1)

- `src/features/properties/components/StepDocs.tsx`

### Archivos a NO tocar

- `src/features/properties/PropertiesView.tsx` (sigue usando `<StepDocs />` con import path-based)
- Otros components del wizard
- `src/shared/ui/*`

## 9. Out of Scope

- ❌ Modales (`ConfirmContinueModal`, etc.) — **no existen en el código actual**.
- ❌ Tests unitarios para las funciones puras (AGENTS.md no permite Vitest).
- ❌ Refactor de `PropertiesView.tsx` (3158 líneas) — spec aparte (#5c).
- ❌ Cambios de UX/comportamiento del wizard.

## 10. Riesgos identificados

- **R1**: El `StepDocs.tsx` quede en >200 líneas porque la lógica es inevitable. **Mitigación**: si pasa, partir más (out of scope para este spec).
- **R2**: Algun import de `getDocStorageState` desde otro archivo se rompa. **Mitigación**: `git grep` antes de empezar.
- **R3**: El bundle size aumente. **Mitigación**: comparar bundle antes/después.

## 11. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]

---

## Anexo: comandos de auditoría para correr ANTES de implementar

```powershell
# Confirmar el inventario actual
(Get-Content "src\features\properties\components\StepDocs.tsx" | Measure-Object -Line).Lines
# Esperado: 814 lineas

# Listar TODOS los importers de StepDocs (cualquier path)
Get-ChildItem "src" -Recurse -Filter "*.ts*" -ErrorAction SilentlyContinue |
  Select-String -Pattern "from ['""].*StepDocs['""]" | ForEach-Object { $_.Path }
```
