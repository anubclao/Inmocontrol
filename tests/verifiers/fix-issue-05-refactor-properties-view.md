# Verifier #5: Refactor de `PropertiesView.tsx`

> **Metodología Karpathy (Agent Skill)**: este verifier se corre DESPUÉS
> de `docs/specs/fix-issue-05-refactor-properties-view.md` aprobado.
> Cada Acceptance Criterion del spec tiene 1+ pasos verificables acá.
> **NO modificar este verifier para hacer que los checks pasen**.
>
> **Estado esperado antes del refactor** (hoy):
> - `PropertiesView.tsx` = 4368 líneas.
> - **No existen** `useWizardState.ts`, `usePropertyDocs.ts`,
>   `slotKeyHelpers.ts`, `finalizeSummary.ts`.
>
> **Estado esperado después del refactor completo** (post-Commit 4):
> - `PropertiesView.tsx` < 500 líneas.
> - Los 4 archivos nuevos existen y son usables.
> - Smoke test E2E del wizard pasa.

## Cómo ejecutar

### Pre-requisitos

- Repo limpio, branch `main`.
- `npm run dev` corriendo en localhost:3000.

### Convención de resultado

- ✅ **PASS** — comportamiento esperado.
- ❌ **FAIL** — comportamiento diverge (reportar real).
- ⚠️ **SKIP** — no se puede verificar (motivo al lado).
- 🔴 **EXPECTED FAIL** — verifier espera que falle (estado pre-refactor). Cuando pase, el refactor está OK.

---

## Baseline checks (pre-refactor)

### BC-1: `PropertiesView.tsx` tiene > 1000 líneas (estado actual)

```powershell
(Get-Content -Raw "src/features/properties/PropertiesView.tsx").Split("`n").Count
```

**Resultado esperado (hoy)**: ≥ 4000.

**Resultado real**: _[registrar]_

**Status:** ✅ EXPECTED FAIL (post-refactor: ≤ 500)

---

### BC-2: archivos nuevos NO existen (estado actual)

```powershell
Test-Path "src/features/properties/hooks/useWizardState.ts"
Test-Path "src/features/properties/hooks/usePropertyDocs.ts"
Test-Path "src/features/properties/utils/slotKeyHelpers.ts"
Test-Path "src/features/properties/utils/finalizeSummary.ts"
```

**Resultado esperado (hoy)**: todos devuelven `False`.

**Status:** ✅ EXPECTED FAIL (post-refactor: todos `True`)

---

## Acceptance Criteria

### AC-1: Estructura target existe

**Pasos:**
1. Verificar archivos:
   ```powershell
   ls src/features/properties/hooks/
   ls src/features/properties/utils/
   ```
2. Verificar líneas por archivo:
   ```powershell
   (Get-Content -Raw "src/features/properties/PropertiesView.tsx").Split("`n").Count
   (Get-Content -Raw "src/features/properties/components/StepBasic.tsx").Split("`n").Count
   (Get-Content -Raw "src/features/properties/components/StepDocs.tsx").Split("`n").Count
   (Get-Content -Raw "src/features/properties/components/StepInventory.tsx").Split("`n").Count
   (Get-Content -Raw "src/features/properties/hooks/useWizardState.ts").Split("`n").Count
   (Get-Content -Raw "src/features/properties/hooks/usePropertyDocs.ts").Split("`n").Count
   ```

**Resultado esperado (post-Commit 4):**
- `PropertiesView.tsx` ≤ 500.
- `useWizardState.ts` existe.
- `usePropertyDocs.ts` existe.
- `slotKeyHelpers.ts` existe.
- `finalizeSummary.ts` existe.

**Resultado real**: _[registrar]_

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-2: Cero cambio funcional — smoke test E2E

**Pasos:**
1. Login con cuenta de prueba.
2. Abrir wizard de nueva propiedad.
3. Step 1 (Basic): completar `address`, `chip`, `folio`, `ownerName`, `propertyType`. Click "Continuar a Documentación".
4. Step 2 (Docs): subir 1 PDF en slot CC. Verificar badge 🟠 "Pendiente → Drive" (si Drive está desconectado) o 🟢.
5. Step 3 (Inventory): llenar al menos 1 item. Click "Finalizar".
6. Modal `finalizeSummary`: verificar que muestra:
   - Total docs subidos: 1.
   - En Drive / solo Local / faltantes / errores (con counts reales).
7. Click "Cerrar". La propiedad aparece en la lista como `Pendiente` o `Activo` (según mandato firmado).

**Resultado esperado**: wizard completa, modal muestra counts reales sin mentir, propiedad persiste.

**Resultado real**: _[registrar qué pasa]_

**Status:** ✅ PASS (esperado mantener comportamiento)

---

### AC-3: Migración incremental (4 commits)

**Pasos:**
1. `git log --oneline | Select-String "refactor(properties)"` → buscar los 4 commits atómicos.

**Resultado esperado**: 4 commits separados, cada uno con mensaje descriptivo y solo modificaciones aisladas.

**Resultado real**: _[registrar commits creados]_

**Status:** ⏳ Pending / ✅ PASS

---

### AC-4: `PropertiesView.tsx` queda como shell puro

**Pasos:**
1. `grep -n "useState\|useEffect\|useReducer" src/features/properties/PropertiesView.tsx` → debe haber menos referencias que antes (la mayoría se movieron a `useWizardState` y `usePropertyDocs`).
2. `grep -n "uploadPdfToDrive\|createPropertyFolders" src/features/properties/PropertiesView.tsx` → debe ser `0` referencias (movidas a `usePropertyDocs`).

**Resultado esperado (post-Commit 4):**
- Mínimo uso de hooks locales.
- NO llamadas directas a `uploadPdfToDrive` ni `createPropertyFolders` (están en `usePropertyDocs`).

**Resultado real**: _[registrar]_

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-5: `useWizardState.ts` exporta hook + tipos

**Pasos:**
1. `grep -n "^export" src/features/properties/hooks/useWizardState.ts` → debe incluir:
   - `export type WizardStep`
   - `export interface WizardDraft`
   - `export interface UseWizardStateReturn`
   - `export function useWizardState`

**Resultado esperado (post-Commit 1):** los 4 exports existen.

**Resultado real**: _[registrar]_

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-6: `usePropertyDocs.ts` exporta hook

**Pasos:**
1. `grep -n "^export" src/features/properties/hooks/usePropertyDocs.ts` → debe incluir `UsePropertyDocsReturn` y `usePropertyDocs`.

**Resultado esperado (post-Commit 2):** los 2 exports existen.

**Resultado real**: _[registrar]_

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-7: `slotKeyHelpers.ts` es puro

**Pasos:**
1. `grep -n "^import.*react\|^from ['\"]react" src/features/properties/utils/slotKeyHelpers.ts` → debe devolver `0` matches.
2. `npm test` debe correr `tests/slotKeyHelpers.test.ts`.

**Tests automatizados nuevos (en `tests/slotKeyHelpers.test.ts`):**
```typescript
// parseDocumentKey
expect(parseDocumentKey("cc_0")).toEqual({ slot: 'cc', index: 0 });
expect(parseDocumentKey("cc_invalid")).toBe(null);
expect(parseDocumentKey("")).toBe(null);

// normalizeFilename
expect(normalizeFilename("Escritura Número 1.pdf")).toBe("Escritura_Numero_1.pdf");
expect(normalizeFilename("Carta 1/2.pdf")).toBe("Carta_1_2.pdf");

// sanitizeSlotIndex
expect(sanitizeSlotIndex(0)).toBe(0);
expect(sanitizeSlotIndex("3")).toBe(3);
expect(sanitizeSlotIndex(-1)).toBe(0);
expect(sanitizeSlotIndex("abc")).toBe(0);
```

**Resultado esperado (post-Commit 3):** archivo sin imports de React + tests pasan.

**Resultado real**: _[registrar]_

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-8: `finalizeSummary.ts` es constructor puro

**Pasos:**
1. `grep -n "^import.*react" src/features/properties/utils/finalizeSummary.ts` → debe devolver `0` matches.
2. `npm test tests/finalizeSummary.test.ts` debe pasar.

**Tests esperados:**
```typescript
// buildFinalizeSummary con 0 docs
const empty = buildFinalizeSummary({ drafts: {}, uploadedDocs: [], property });
expect(empty.totalDocs).toBe(0);
expect(empty.enDrive).toBe(0);

// con 1 doc en Drive
const onDrive = buildFinalizeSummary({
  drafts: { cc: [{ url: 'https://drive.google.com/...' }] },
  uploadedDocs: [],
  property
});
expect(onDrive.enDrive).toBe(1);
```

**Resultado esperado (post-Commit 4):** archivo sin React + tests pasan.

**Status:** 🔴 EXPECTED FAIL (hoy) / ⏳ Pending / ✅ PASS

---

### AC-9: No se introdujeron dependencias nuevas

**Pasos:**
1. `git diff package.json` → debe ser vacío.

**Resultado esperado (post-Commit 4):** `package.json` no cambió.

**Status:** ✅ PASS (esperado)

---

### AC-10: Tests pre-existentes siguen pasando

**Pasos:**
1. `npm run lint` → exit 0.
2. `npm test` → todos los tests pasan (settlement, numeroALetras, permissions-matrix, slotKeyHelpers, finalizeSummary).

**Resultado esperado (post-Commit 4):** todos verdes.

**Resultado real**: _[registrar]_

**Status:** ⏳ Pending / ✅ PASS

---

## Edge Cases

### EC-1 a EC-10 del spec → tests automatizados en `slotKeyHelpers.test.ts` y `finalizeSummary.test.ts`.

Son tests unitarios. **Si pasan, el refactor está bien**.
Si fallan, hay un bug en el código extraído.

### EC-4: Wizard interrumpido (continuación)

**Pasos:**
1. Abrir wizard, completar step 1.
2. Refrescar el browser (F5).
3. Verificar que el wizard ofrece "Continuar registro" o detecta el draft.

**Resultado esperado (preservar comportamiento actual)**: el refactor NO cambia esto.

**Status:** ✅ PASS (esperado)

---

## Orden de ejecución recomendado

### Commit 1 (`refactor(properties): extract useWizardState hook`)

```bash
git checkout -b refactor/properties-wizard-state
git add src/features/properties/hooks/useWizardState.ts
git add src/features/properties/PropertiesView.tsx
npm run lint && npm test
./scripts/smoke-test-e2e.mjs   # opcional
git commit -m "..."
git push origin refactor/properties-wizard-state
```

**Criterio de merge**: `wc -l` de PropertiesView baja a ~3700 y tests pasan.

### Commit 2 (`refactor(properties): extract StepDocs + usePropertyDocs`)

**Criterio**: smoke test del wizard (drag & drop funciona, badges correctos).

### Commit 3 (`refactor(properties): extract slotKeyHelpers + tests`)

**Criterio**: tests de slotKeyHelpers pasan.

### Commit 4 (`refactor(properties): extract finalizeSummary + <500 líneas`)

**Criterio**: `wc -l PropertiesView.tsx` ≤ 500 + todos los tests pasan + modal de cierre muestra counts correctos.

**Después del Commit 4**: PR a main. Auto-deploy a Hostinger.

---

## Resumen de ejecución

Después de correr todos los checks:

| AC | Status esperado |
|---|---|
| AC-1 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-2 | ✅ PASS (smoke test) |
| AC-3 | ✅ PASS (4 commits) |
| AC-4 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-5 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-6 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-7 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-8 | 🔴 EXPECTED FAIL → ✅ PASS |
| AC-9 | ✅ PASS (sin cambios en package.json) |
| AC-10 | ✅ PASS (tests verdes) |

**Veredicto final:**
- ✅ ALL PASS → listo para merge a main y deploy.
- ❌ N FAIL → volver a FASE 4 (implementación), NO tocar este verifier.

## Historial de ejecuciones

| Fecha | Commit | Resultado | Notas |
|---|---|---|---|
| 2026-08-03 | (no ejecutado) | 🔴 baseline | primera ejecución pre-refactor |