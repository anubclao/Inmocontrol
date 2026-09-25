# Spec #5b: Refactor de `PropertiesView.tsx` — extracción de modales y shell

> **Karpathy Spec** — continuación del refactor #5. El Commit 4 bajó
> el monolito de 4368 → 4282 líneas. Aún **NO llegamos al objetivo
> <500**, porque los 4282 se componen mayormente de **JSX** (modales
> inline + render del wizard + handlers de upload), no de funciones
> puras.
>
> Este spec apunta a extraer los **componentes modales** que están
> definidos inline en `PropertiesView.tsx` (líneas ~2820-4180, ~1300
> líneas JSX). Cada modal sale con su **state local** y sus **callbacks
> tipados**. PropertiesView pasa a ser un **shell orquestador** que
> gestiona el state de UI (modales abiertos/cerrados, doc en preview)
> y delega el render a sus hijos.
>
> Spec base: `fix-issue-05-refactor-properties-view.md` (AC-1 dice
> <500 líneas — este spec #5b es la continuación para cumplirlo).

## 1. User Story

**As a** maintainer de InmoControl,
**I want to** extraer los 5 modales principales de `PropertiesView.tsx`
a componentes separados con state y callbacks tipados — **sin cambiar
comportamiento**,
**So that** el archivo quede **<500 líneas** (objetivo del spec #5 AC-1)
y cada modal sea testeable y modificable de forma aislada.

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: Estructura target final (post-todos los commits)

```
src/features/properties/
  PropertiesView.tsx                    # shell orquestador (<500 líneas)
  components/
    FinalizeSummaryModal.tsx            # [NUEVO Commit 1] modal post-finalize
    PropertyDetailModal.tsx             # [NUEVO Commit 2] modal de detalle
    PhotoGalleryModal.tsx               # [NUEVO Commit 3] galería de fotos del inventario
    DiscardDraftModal.tsx               # [NUEVO Commit 4] confirmar descarte de wizard
    DocViewerModal.tsx                  # [NUEVO Commit 5] preview de PDF en navegador
```

**Verificable:** `wc -l src/features/properties/PropertiesView.tsx` devuelve **≤ 500** después del Commit 5.

### AC-2: `PropertiesView.tsx` queda como shell puro

- Solo contiene:
  - State de UI (qué modal está abierto, qué doc se previsualiza).
  - Render del wizard de captación (Steps 1-3, no se mueve el wizard).
  - Render de la tabla de propiedades (lista).
  - Switch de modales (cada `<ModalX />` recibe props tipadas).
- **NO queda JSX grande (>200 líneas) inline** — todo lo grande sale.
- **NO quedan** handlers como `handleDownloadMandato`, `handleUploadMandato`,
  `handleConfirmDelete` *como bloques largos*. Las acciones se quedan
  en `PropertiesView` pero se invocan con props cortas, no con JSX
  gigante.

### AC-3: Cada modal nuevo tiene contrato tipado

```typescript
// Ejemplo (FinalizeSummaryModal):
export interface FinalizeSummaryModalProps {
  isOpen: boolean;
  summary: FinalizeSummary | null;
  onClose: () => void;
  // si en el futuro el modal necesita disparar acciones (ej: reintentar upload),
  // se pasan como callbacks:
  onRetryUpload?: () => void;
}

export function FinalizeSummaryModal(props: FinalizeSummaryModalProps): JSX.Element;
```

- Cero `any` en las props públicas (per AGENTS.md).
- Tipos exportados para que tests + consumidores los usen.

### AC-4: Cero cambio funcional

- Las 8 modales se siguen mostrando igual (mismo copy, mismas animaciones, mismo z-index).
- Mismos flujos: wizard → finalize → modal summary → close. Detail modal → subir mandato → close. Photo gallery → lightbox → close.
- `appStore` sigue siendo la fuente de verdad. Los modales NO tienen acceso directo al store; reciben props.
- `GET /api/health` 200 antes y después.
- `npm run lint` 0 errores.

### AC-5: Migración incremental en 5 commits (no en 1)

| # | Commit | Líneas restantes | Target después |
|---|---|---|---|
| 1 | `extract FinalizeSummaryModal` | ~3800 | modal summary aislado |
| 2 | `extract PropertyDetailModal` | ~2800 | modal de detalle aislado |
| 3 | `extract PhotoGalleryModal` | ~2400 | galería de fotos aislada |
| 4 | `extract DiscardDraftModal` | ~2350 | confirm discard aislado |
| 5 | `extract DocViewerModal + shell cleanup` | **≤ 500** | shell orquestador |

**Entre commits:** `npm run lint` 0 errores + smoke test manual + al menos 1 verifier check OK.

### AC-6: Tests del shell (no de los modales individuales)

- Los modales pequeños no requieren tests unitarios propios (son JSX directo).
- Lo importante es que `npm run lint` pasa y `wc -l` baja.
- Un test E2E sigue siendo manual vía el verifier existente.

### AC-7: No se introducen dependencias nuevas

- Solo React + tipos + el `appStore` + las props.
- NO agregar librería de UI, NO agregar Vitest/Playwright.

### AC-8: Patrón de extracción consistente

Cada commit sigue este orden:

1. Crear componente nuevo con `<X>ModalProps` interface + `export function <X>Modal(props)`.
2. Cortar el JSX + state del modal desde `PropertiesView.tsx`.
3. Pegar en el nuevo componente + ajustar referencias (zustand state → props).
4. Reemplazar el `<ModalX />` inline en `PropertiesView` por `<XModal {...props} />`.
5. Verificar que compila y lint pasa.

### AC-9: Sidebar: `handleDownloadMandato`, `handleUploadMandato` se quedan en el componente padre

- Estos handlers son **del shell**, no del modal. El modal solo renderiza.
- Si el handler crece a >50 líneas, se extrae a `utils/pdf.ts` o similar (Fase 5c futura).
- Para este spec, se quedan donde están.

### AC-10: `PropertiesView` mantiene el state acoplado a los modales

- `viewingDoc`, `viewingProperty`, `confirmDiscardDraft`, `photoGallery`, etc. **se quedan** en el shell.
- Se pasan a los modales como props (no se mueven state aún).
- Futuros commits (#5c) podrían mover esos state a hooks (`useModalsState()`).

## 3. Edge Cases

### EC-1 — Modal sin resumen (`summary: null` en `FinalizeSummaryModal`)

- **Trigger**: el modal se abre pero el state es null.
- **Comportamiento**: el modal retorna `null` (no renderiza nada).
- **Razón**: state transitorio entre llamadas.

### EC-2 — Modal de detalle abierto y se actualiza `viewingProperty` desde store

- **Trigger**: el user hace un upload de mandato mientras el modal está abierto.
- **Comportamiento**: el modal usa `key={viewingProperty.id}` o el prop fresco.
- **Verificable**: smoke test E2E.

### EC-3 — Photo gallery con 0 fotos

- **Trigger**: el user abre el gallery pero no hay fotos.
- **Comportamiento**: muestra estado vacío "Sin fotos".

### EC-4 — DiscardDraftModal sin IDs en MySQL

- **Trigger**: el agente descarta el wizard antes de pasar a step 2 (sin persistencia).
- **Comportamiento**: el modal NO muestra el texto "Ya tiene inventarios" (no aplica).

### EC-5 — DocViewerModal con URL que no carga

- **Trigger**: la URL del PDF apunta a un archivo borrado.
- **Comportamiento**: el modal muestra mensaje de error + botón "Cerrar".

### EC-6 — Modal de detalle con propiedad legacy (sin `inventory_count`)

- **Trigger**: la propiedad fue creada antes de migración 009.
- **Comportamiento**: el modal muestra los badges adaptándose (sin inventory_count).

### EC-7 — Lightbox foto 404

- **Trigger**: la foto en IndexedDB fue borrada manualmente.
- **Comportamiento**: muestra placeholder.

### EC-8 — Refactor con wizard activo en localStorage

- **Trigger**: deploy durante un wizard abierto en otra pestaña.
- **Comportamiento**: el modal nuevo sigue siendo compatible.

## 4. Technical Contract

### Interfaces TS nuevas

```typescript
// components/FinalizeSummaryModal.tsx
export interface FinalizeSummaryModalProps {
  isOpen: boolean;
  summary: FinalizeSummary | null;
  address: string;          // para el título del modal
  driveFolderPath: string | null;
  onClose: () => void;
}

// components/PropertyDetailModal.tsx
export interface PropertyDetailModalProps {
  isOpen: boolean;
  property: any | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onUploadMandato: (propertyId: string) => void;
  onDownloadMandato: (property: any) => Promise<void>;
  onRequestDelete: (property: any) => void;
  // ... callbacks tipados
}

// components/PhotoGalleryModal.tsx
export interface PhotoGalleryModalProps {
  isOpen: boolean;
  propertyId: string | null;
  address: string;
  photos: PhotoItem[];
  onClose: () => void;
}

// components/DiscardDraftModal.tsx
export interface DiscardDraftModalProps {
  isOpen: boolean;
  hasPersistedProperty: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// components/DocViewerModal.tsx
export interface DocViewerModalProps {
  isOpen: boolean;
  label: string;
  url: string;
  onClose: () => void;
}
```

### Archivos a crear (5 nuevos)

- `src/features/properties/components/FinalizeSummaryModal.tsx`
- `src/features/properties/components/PropertyDetailModal.tsx`
- `src/features/properties/components/PhotoGalleryModal.tsx`
- `src/features/properties/components/DiscardDraftModal.tsx`
- `src/features/properties/components/DocViewerModal.tsx`

### Archivos a modificar (1)

- `src/features/properties/PropertiesView.tsx` — el shell queda con:
  - Imports de los nuevos modales.
  - State de UI (qué modal está abierto) igual.
  - Render del wizard igual.
  - Switch de modales actualizado (reemplaza JSX inline por `<XModal {...props} />`).
  - Handlers `handleDownloadMandato`, `handleUploadMandato` se quedan (mientras no excedan 200 líneas).

### Archivos a NO tocar

- `src/features/properties/components/StepBasic.tsx` (ya existe).
- `src/features/properties/components/StepDocs.tsx` (ya existe).
- `src/features/properties/components/StepInventory.tsx` (ya existe).
- `src/App.tsx` (no se toca).
- `server/*` (refactor frontend).

## 5. Timeouts (explícitos)

- **Refactor**: cero impacto en latencia.
- **Tests**: `npm test` debe seguir <30s.

## 6. Tostadas exactas (copy approved — NO improvisar)

**NO cambian**. El refactor preserva los toasts existentes.

## 7. Dependencias

- Ninguna nueva.

## 8. Out of Scope

- ❌ **Mover el state de los modales** a hooks (`useModalsState`) — eso es spec #5c.
- ❌ **Refactor de `App.tsx`** — spec aparte.
- ❌ **Extraer `handleDownloadMandato` / `handleUploadMandato`** si se quedan <200 líneas.
- ❌ **Tests unitarios de cada modal** — son JSX directo, no vale la pena.
- ❌ **Storybook** para los modales — no aplica.
- ❌ **Cambios de UX** en los modales — preservar pixel-perfect.

## 9. Riesgos identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Commit rompe un modal (UI rota) | Media | Alta | Smoke test E2E + verificar visualmente después de cada commit |
| Props tipados incompletos (algún callback falta) | Media | Alta | Listado exhaustivo de callbacks en la sección 4 |
| Re-render excesivo en PropertyDetailModal | Baja | Media | Verificar `key={property.id}` para forzar re-mount |
| State acoplado entre modales | Baja | Baja | Cada modal tiene su propio state interno mínimo (loading flags) |
| Refactor rompe el drag&drop | Baja | Alta | Solo extraemos modales; StepDocs sigue igual |

## 10. Approval

**Status:** ⏳ Pending Review (spec #5b — continuación del refactor #5)
**Aprobado por:** —
**Fecha de aprobación:** —

> Spec base: `fix-issue-05-refactor-properties-view.md` (AC-1: <500 líneas).
> Este spec define los **5 commits adicionales** para cumplir AC-1.

---

> **Recordatorio Karpathy**: una vez aprobado, sigue
> `tests/verifiers/fix-issue-5b-refactor-properties-view-modals.md` (a
> crear). NO escribir código hasta que el spec esté aprobado Y el verifier
> también.