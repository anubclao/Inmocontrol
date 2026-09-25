# Spec #5: Refactor de `PropertiesView.tsx` (4368 líneas → <500 + archivos extraídos)

> **Karpathy Spec** — FASE 2 del proyecto (`AGENTS.md`). El monolito
> `PropertiesView.tsx` es la deuda técnica más grande. Este spec define
> la división en archivos siguiendo el orden de commits del spec
> anterior (`fix-issue-05`), ampliado con user story, edge cases,
> technical contract y toasts exactos.
>
> **No rompe el monolito en un solo commit.** Parte `PropertiesView.tsx`
> por responsabilidad (state machine / hooks / utils) en 4 commits
> separados, manteniendo la app corriendo y el lint limpio entre cada
> paso.
>
> **Reemplaza** la versión anterior del spec (preserva los ACs originales
> como base).

## 1. User Story

**As a** maintainer de InmoControl,
**I want to** dividir `PropertiesView.tsx` (4368 líneas) en archivos
más pequeños por responsabilidad (state machine, hooks, utils) — **sin
cambiar comportamiento**,
**So that** sea navegable, testeable unitariamente, y cada commit sea
reversible si rompemos algo en prod.

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: Estructura target

```
src/features/properties/
  PropertiesView.tsx                    # shell + wizard step router (~300 líneas, IDEALMENTE <500)
  components/
    StepBasic.tsx                       # <400 líneas (ya existe ~398 hoy)
    StepDocs.tsx                        # <500 líneas (ya existe ~514)
    StepInventory.tsx                   # <700 líneas (ya existe ~660)
  hooks/
    useWizardState.ts                   # [NUEVO] state machine del wizard (Steps + GoTo + Discard + Finalize queue)
    usePropertyDocs.ts                  # [NUEVO] upload/Drive/blob logic separada del componente
  utils/
    slotKeyHelpers.ts                   # [NUEVO] parseDocumentKey, normalizeFilename, sanitizeSlotIndex
    finalizeSummary.ts                  # [NUEVO] constructor del FinalizeSummary (modal al terminar wizard)
```

**Verificable:** después del Commit 4, `wc -l src/features/properties/PropertiesView.tsx` devuelve ≤ 500.

### AC-2: Cero cambio funcional

- Wizard abre, captura datos básicos → pasa a docs → pasa a inventario → finaliza con badge 🟢/🟠 correcto.
- Mismos props, mismos flujos, mismos **toasts exactos** (no se cambia copy).
- `GET /api/health` → 200 antes y después de cada commit.
- `appStore` (Zustand) sigue conteniendo la misma shape.
- Dragón-drop de PDFs en `StepDocs` sigue funcionando.
- Modal de descarte sigue cerrando según reglas existentes.

### AC-3: Migración incremental en 4 commits (no en 1)

**Commit 1**: extraer `useWizardState` (state machine del wizard).
- `PropertiesView.tsx` baja a ~3700 líneas.
- Solo se mueven tipos puros TS + el reducer/setState moves; no se cambia DOM/JSX.

**Commit 2**: extraer `StepDocs` + `usePropertyDocs`.
- `PropertiesView.tsx` baja a ~2500 líneas.
- Upload logic (Drive + blob URL) sale del componente.

**Commit 3**: extraer `utils/slotKeyHelpers`.
- Helpers puros (sin React). Testeable.
- `PropertiesView.tsx` baja a ~2300 líneas.

**Commit 4**: extraer `finalizeSummary` (constructor del modal summary).
- `PropertiesView.tsx` baja a **<500** líneas.

**Entre commits:** `npm run lint` + `/api/health` 200 + smoke test manual.

### AC-4: `PropertiesView.tsx` queda como shell puro

- Solo contiene: imports, el `PropertiesView` component, render del wizard con sus step router, callbacks del store (Zustand), y el modal `finalizeSummary` JSX.
- NO queda state machine ni lógica de upload.

### AC-5: `useWizardState.ts` exporta hook + tipos

- Hook: `useWizardState()` devuelve `{ step, draft, draftId, goNext, goBack, reset, finalize() }`.
- Tipos: `WizardStep`, `WizardDraft`, `WizardState`.
- NO depende de `appStore` (puede recibir setters via context/argument).

### AC-6: `usePropertyDocs.ts` exporta hook

- Hook: `usePropertyDocs(propertyId)` devuelve `{ uploadFile, deleteFile, getDocStorageState, driveStatus }`.
- Encapsula: validación de archivo, subida a Drive, fallback blob URL.

### AC-7: `slotKeyHelpers.ts` es puro (sin React)

- Funciones: `parseDocumentKey(key)`, `normalizeFilename(name)`, `sanitizeSlotIndex(i)`.
- 100% testeable con `node:test`.
- Cobertura: ver EC-1 a EC-5 abajo.

### AC-8: `finalizeSummary.ts` es constructor puro

- Función: `buildFinalizeSummary({ drafts, uploadedDocs, driveFolderId })` devuelve un objeto serializable que el modal renderiza.
- Testeable sin React.

### AC-9: No se introducen dependencias nuevas

- Solo React + el `appStore` existente + las nuevas funciones internas.
- NO agregar ESLint, Prettier, Vitest (per AGENTS.md §"Lo que NO hacer").

### AC-10: Tests pre-existentes siguen pasando

- `npm test` (settlement + numeroALetras + permissions-matrix) sigue en verde.
- `tests/verifiers/wizard_property.md` (los ACs del flujo del wizard) sigue marcando ✅.

## 3. Edge Cases

### EC-1 — `parseDocumentKey` con key malformada

- **Trigger**: input como `"cc"`, `"cc_invalid"`, `""`, `null`.
- **Comportamiento**: devuelve `null` o lanza `Error` (a definir; default deny).
- **Test**: input → output exacto.

### EC-2 — `normalizeFilename` con nombre con acentos/espacios

- **Trigger**: `"Escritura Número 1.pdf"`.
- **Comportamiento**: `"Escritura_Numero_1.pdf"`.

### EC-3 — `useWizardState` con draft NULL (wizard cerrado)

- **Trigger**: propiedad sin wizard en curso.
- **Comportamiento**: `step='none'`, `draft=null`.

### EC-4 — Commit interrumpido (wizard en step 2)

- **Trigger**: el agente cierra el browser en medio del wizard.
- **Comportamiento actual**: localStorage puede tener un draft; al volver, el wizard detecta y pregunta "¿Continuar?". El refactor NO cambia este comportamiento.

### EC-5 — Upload simultáneo de 2 archivos en `StepDocs`

- **Trigger**: el agente selecciona 2 PDFs al mismo tiempo.
- **Comportamiento**: el hook `usePropertyDocs` debe garantizar que cada upload va a su slot correcto (no se cruzan).

### EC-6 — Drag & drop roto en `StepDocs`

- **Trigger**: el agente arrastra un PDF al slot equivocado.
- **Comportamiento**: el badge se actualiza igual (por slot key).

### EC-7 — Modal de descarte (`FinalizeSummary`) con cero docs subidos

- **Trigger**: el agente cierra el wizard sin subir ningún doc.
- **Comportamiento**: el modal muestra "❌ Sin docs subidos" (no falla).

### EC-8 — `PropertiesView` re-render por cambio de Zustand

- **Trigger**: el store cambia (ej: nueva propiedad agregada).
- **Comportamiento**: el componente re-renderiza. NO se rompe.

### EC-9 — Tests de regresión automatizados

- **Trigger**: `npm run lint` + `npm test`.
- **Comportamiento**: pasan los 3 tests viejos + el de slotKeyHelpers (nuevo, post-Commit 3).

### EC-10 — Refactor con wizards activos (producción)

- **Trigger**: deploy durante uso activo (agentes con wizards a medias).
- **Comportamiento**: el draft de localStorage sigue siendo compatible (mismas keys, misma shape).

## 4. Technical Contract

### Interfaces TS nuevas

```typescript
// hooks/useWizardState.ts
export type WizardStep = 'none' | 'basic' | 'docs' | 'inventory' | 'finalize';

export interface WizardDraft {
  localId: string;
  propertyDbId?: string;
  step1: BasicData;
  step2: Record<DocumentSlot, UploadedDoc[]>;
  step3: Inventory | null;
}

export interface UseWizardStateReturn {
  step: WizardStep;
  draft: WizardDraft | null;
  draftId: string | null;
  goNext: () => void;
  goBack: () => void;
  reset: () => void;
  finalize: () => Promise<void>;
}

export function useWizardState(propertyLocalId?: string): UseWizardStateReturn;

// hooks/usePropertyDocs.ts
export interface UsePropertyDocsReturn {
  uploadFile: (slot: DocumentSlot, file: File) => Promise<void>;
  deleteFile: (slot: DocumentSlot, index: number) => Promise<void>;
  getDocStorageState: (slot: DocumentSlot) => StorageState;
  driveStatus: 'connected' | 'disconnected' | 'unknown';
}

export function usePropertyDocs(propertyDbId: string): UsePropertyDocsReturn;

// utils/slotKeyHelpers.ts (puro)
export function parseDocumentKey(key: string): { slot: DocumentSlot; index: number } | null;
export function normalizeFilename(name: string): string;
export function sanitizeSlotIndex(i: number | string): number;

// utils/finalizeSummary.ts (puro)
export interface FinalizeSummaryInput {
  drafts: Record<DocumentSlot, UploadedDoc[]>;
  uploadedDocs: Array<{ slot: DocumentSlot; url: string; blob?: Blob }>;
  driveFolderId?: string;
  property: Property;
}

export interface FinalizeSummary {
  totalDocs: number;
  enDrive: number;
  soloLocal: number;
  faltantes: number;
  errores: string[];
  driveFolderUrl?: string;
}

export function buildFinalizeSummary(input: FinalizeSummaryInput): FinalizeSummary;
```

### Archivos a crear (nuevos)

- `src/features/properties/hooks/useWizardState.ts`
- `src/features/properties/hooks/usePropertyDocs.ts`
- `src/features/properties/utils/slotKeyHelpers.ts`
- `src/features/properties/utils/finalizeSummary.ts`
- `tests/slotKeyHelpers.test.ts` (nuevo test, post-Commit 3)
- `tests/finalizeSummary.test.ts` (nuevo test, post-Commit 4)

### Archivos a modificar

- `src/features/properties/PropertiesView.tsx` — el monolito, baja de 4368 → <500.
- `src/features/properties/components/StepDocs.tsx` — usar `usePropertyDocs`.
- (no más modificaciones que `PropertiesView`)

### Archivos a NO tocar

- `src/App.tsx` (no se toca el shell externo).
- `src/features/properties/PropertiesView.tsx` API pública (las props y exports siguen iguales).
- `server/*` (refactor SOLO del frontend).

## 5. Timeouts (explícitos)

- **Refactor**: no agrega latencia. Los timeouts de upload siguen siendo
  15s (existente en DRIVE-FALLBACK-001).
- **Tests**: `npm test` debe terminar en <30s.

## 6. Tostadas exactas (copy approved — NO improvisar)

**NO cambian**. El refactor preserva los toasts existentes. Si en el
proceso aparece un toast nuevo, se documenta aparte en el spec puntual
de esa feature.

## 7. Dependencias

- Ninguna nueva.
- Se reusan: `zustand`, `react`, `bcryptjs`, etc.

## 8. Out of Scope

- ❌ **Refactor de `App.tsx`** (3158 líneas) — Fase 2 distinta, spec separado.
- ❌ **Refactor de otros monolitos** (BillingPanel, etc.) — solo PropertiesView.
- ❌ **Cambiar comportamiento** del wizard (correcciones de bugs se hacen por separado).
- ❌ **Migrar de Zustand a Redux / Jotai** — no.
- ❌ **Agregar ESLint / Prettier** — per AGENTS.md.
- ❌ **Tests E2E automatizados** (Playwright, Cypress) — sigue manual con el verifier markdown.
- ❌ **TypeScript strict mode** — `tsc --noEmit` ya cubre lo necesario hoy.
- ❌ **Refactor del `wizardInventoryDB`** (IndexedDB) — fuera de alcance de este spec.

## 9. Riesgos identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Commit rompe el wizard (tests fallan) | Media | Alta | Tests automatizados + smoke test después de cada commit |
| Drag & drop deja de funcionar | Baja | Alta | Commit 2 aislado, verificar visualmente |
| Regresión en `finalizeSummary` (modal miente) | Media | Alta | Commit 4 aislado + tests nuevos |
| localStorage incompatible entre versiones | Baja | Media | Draft usa keys/shape existente — sin cambios |

## 10. Approval

**Status:** ⏳ Pending Review (versión enriquecida Karpathy del spec original #5)
**Aprobado por:** —
**Fecha de aprobación:** —

> Spec base: `fix-issue-05-refactor-properties-view.md` original (preservado).
> Este spec lo amplía con user story, edge cases, technical contract, y
> mapeo de archivos. La estructura target es la misma.

---

> **Recordatorio Karpathy**: una vez aprobado, sigue
> `tests/verifiers/fix-issue-05-refactor-properties-view.md` (ya existe,
> se amplía). NO escribir código de refactor hasta que el spec esté
> aprobado Y el verifier ampliado también.