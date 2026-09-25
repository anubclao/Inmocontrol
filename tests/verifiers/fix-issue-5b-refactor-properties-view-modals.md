# Verifier #5b: Refactor #5b — extracción de modales de `PropertiesView.tsx`

> **Metodología Karpathy (Agent Skill)**: este verifier se corre DESPUÉS
> de `docs/specs/fix-issue-5b-refactor-properties-view-modals.md`
> aprobado. Cada Acceptance Criterion del spec tiene 1+ pasos
> verificables acá. **NO modificar este verifier para hacer pasar los
> checks**.
>
> **Estado esperado antes del refactor #5b** (post-espec #5 Commits 1-4):
> - `PropertiesView.tsx` = 4282 líneas.
> - **No existen** `FinalizeSummaryModal.tsx`, `PropertyDetailModal.tsx`,
>   `PhotoGalleryModal.tsx`, `DiscardDraftModal.tsx`, `DocViewerModal.tsx`.
>
> **Estado esperado después del refactor #5b completo** (post-Commit 5):
> - `PropertiesView.tsx` **≤ 500 líneas**.
> - Los 5 modales nuevos existen como componentes con props tipados.

## Cómo ejecutar

### Pre-requisitos

- Spec #5b aprobado.
- Branch `main` con los commits `b187900`, `a3488c3`, `ec00470` ya aplicados.
- `npm run dev` corriendo en localhost:3000.

### Convención de resultado

- ✅ **PASS** — comportamiento esperado.
- ❌ **FAIL** — diverge (reportar real).
- 🔴 **EXPECTED FAIL** — verifier espera que falle (estado pre-refactor #5b).

---

## Baseline checks

### BC-1: `PropertiesView.tsx` tiene > 4000 líneas (estado actual post-#5)

```powershell
(Get-Content -Raw "src/features/properties/PropertiesView.tsx").Split("`n").Count
```

**Resultado esperado (hoy)**: 4282.

**Resultado real**: _[registrar]_

**Status:** ✅ EXPECTED FAIL (post-#5b: ≤ 500)

---

### BC-2: archivos de modales NO existen (estado actual)

```powershell
Test-Path "src/features/properties/components/FinalizeSummaryModal.tsx"
Test-Path "src/features/properties/components/PropertyDetailModal.tsx"
Test-Path "src/features/properties/components/PhotoGalleryModal.tsx"
Test-Path "src/features/properties/components/DiscardDraftModal.tsx"
Test-Path "src/features/properties/components/DocViewerModal.tsx"
```

**Resultado esperado (hoy)**: todos `False`.

**Status:** ✅ EXPECTED FAIL (post-#5b: todos `True`)

---

## Acceptance Criteria

### AC-1: Estructura target final existe (los 5 modales)

**Pasos:**
1. `ls src/features/properties/components/` → debe listar los 5 archivos nuevos.
2. `wc -l src/features/properties/PropertiesView.tsx` → debe ser **≤ 500**.

**Resultado esperado (post-Commit 5):**
- 5 archivos `*Modal.tsx` existen.
- `PropertiesView.tsx` ≤ 500.

**Resultado real**: _[registrar]_

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-2: `PropertiesView.tsx` queda como shell puro

**Pasos:**
1. `grep -c "<Modal" src/features/properties/PropertiesView.tsx` → debe haber **menos** matches que antes (hoy hay 8). Después del refactor, solo quedan los `<XModal />` externos.
2. `wc -l src/features/properties/PropertiesView.tsx` → **≤ 500**.

**Resultado esperado (post-Commit 5):** shell compacto, 0 modales inline grandes.

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-3: Cada modal nuevo tiene contrato tipado

**Pasos:**
```powershell
grep -n "^export interface " src/features/properties/components/FinalizeSummaryModal.tsx
grep -n "^export interface " src/features/properties/components/PropertyDetailModal.tsx
grep -n "^export interface " src/features/properties/components/PhotoGalleryModal.tsx
grep -n "^export interface " src/features/properties/components/DiscardDraftModal.tsx
grep -n "^export interface " src/features/properties/components/DocViewerModal.tsx
```

**Resultado esperado (post-todos los commits):**
- Los 5 interfaces exportados existen con nombres `*ModalProps`.

**Resultado real**: _[registrar]_

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-4: Cero cambio funcional — smoke test E2E

**Pasos (manual):**

1. Abrir wizard de captación, finalizar → confirmar que aparece el
   `<FinalizeSummaryModal>` con el mismo copy/contenido.

2. Click en una propiedad → confirmar que aparece el
   `<PropertyDetailModal>` con tabs y botones.

3. Click en fotos del inventario → confirmar que aparece el
   `<PhotoGalleryModal>` con las fotos.

4. Abrir wizard, intentar descartar → confirmar que aparece el
   `<DiscardDraftModal>`.

5. Click en un PDF (CC, Predial, etc.) → confirmar que aparece el
   `<DocViewerModal>`.

**Resultado esperado:** los 5 modales aparecen y funcionan idénticos al pre-refactor.

**Resultado real**: _[registrar smoke test]_

**Status:** ✅ PASS (esperado mantener comportamiento)

---

### AC-5: Migración incremental (5 commits)

**Pasos:**
```powershell
git log --oneline | Select-String "refactor(properties): extract (FinalizeSummary|PropertyDetail|PhotoGallery|DiscardDraft|DocViewer) Modal"
```

**Resultado esperado:** 5 commits separados atómicos.

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-6: Tests del shell — `npm run lint` pasa

**Pasos:**
```powershell
npm run lint
```

**Resultado esperado:** `exit 0` después de cada commit.

**Resultado real**: _[registrar por commit]_

**Status:** ⏳ Pending / ✅ PASS

---

### AC-7: Sin dependencias nuevas

**Pasos:**
```powershell
git diff package.json
```

**Resultado esperado:** `package.json` no cambia durante el refactor #5b.

**Status:** ✅ PASS (esperado)

---

### AC-8: Patrón de extracción consistente (verificable por inspección)

- Cada commit debe seguir el orden documentado en AC-8 del spec.
- Diff legible: el modal extraído se ve claramente como archivo nuevo.
- PropertiesView pierde líneas en cada commit.

**Resultado esperado:** consistencia visual en cada diff.

**Status:** ⏳ Pending / ✅ PASS

---

### AC-9: `handleDownloadMandato` y `handleUploadMandato` se quedan en el shell

**Pasos:**
```powershell
grep -n "handleDownloadMandato\|handleUploadMandato" src/features/properties/PropertiesView.tsx
```

**Resultado esperado:** definidos en `PropertiesView.tsx`, no movidos a un modal.

**Status:** 🔴 EXPECTED FAIL (hoy, hay 1 en cada lugar) / ⏳ Pending / ✅ PASS

---

### AC-10: State de modales sigue en el shell

**Pasos:**
```powershell
grep -n "useState" src/features/properties/components/*Modal.tsx
```

**Resultado esperado (post-#5b):**
- Los modales individuales NO tienen `useState` grandes (solo loading flags).
- El state sigue en `PropertiesView.tsx`.

**Resultado real**: _[registrar]_

**Status:** ⏳ Pending / ✅ PASS

---

## Orden de ejecución recomendado

Cada commit:

1. `git checkout -b refactor/properties-<X>-modal` (opcional).
2. Crear componente con props tipadas.
3. Cortar JSX inline de `PropertiesView.tsx`.
4. Reemplazar por `<XModal {...props} />`.
5. `npm run lint` + smoke test manual.
6. `git add` selectivo + commit con mensaje descriptivo.

### Commit 1 (`extract FinalizeSummaryModal`)

**Antes**: 4282 → **esperado ~3800**.

Criterio: smoke test del wizard (al finalizar sale el modal summary con todos los contadores correctos).

### Commit 2 (`extract PropertyDetailModal`)

**Antes**: ~3800 → **esperado ~2800**.

Criterio: smoke test (click en propiedad → modal con botones de mandato, eliminar, etc.).

### Commit 3 (`extract PhotoGalleryModal`)

**Antes**: ~2800 → **esperado ~2400**.

Criterio: smoke test (click en fotos del inventario → modal gallery).

### Commit 4 (`extract DiscardDraftModal`)

**Antes**: ~2400 → **esperado ~2350**.

Criterio: smoke test (intentar descartar wizard → modal de confirmación).

### Commit 5 (`extract DocViewerModal + shell cleanup`)

**Antes**: ~2350 → **≤ 500**.

Criterio: smoke test (click en PDF → modal viewer).

---

## Resumen de ejecución

| AC | Status esperado |
|---|---|
| AC-1 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-2 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-3 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-4 | ✅ PASS (smoke test) |
| AC-5 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-6 | ✅ PASS (lint exit 0) |
| AC-7 | ✅ PASS (package.json sin cambios) |
| AC-8 | ✅ PASS (commits consistentes) |
| AC-9 | ✅ PASS (handlers en shell) |
| AC-10 | ✅ PASS (state acoplado al shell) |

**Veredicto:**
- ✅ ALL PASS → listo para merge + auto-deploy + cierre del refactor.
- ❌ N FAIL → volver a FASE 4, NO tocar este verifier.

## Historial de ejecuciones

| Fecha | Commits | Resultado | Notas |
|---|---|---|---|
| 2026-08-03 | (no ejecutado) | 🔴 baseline | 4282 líneas en `PropertiesView.tsx` |