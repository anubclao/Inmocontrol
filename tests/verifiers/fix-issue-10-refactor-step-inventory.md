# Verifier — fix-issue-10 (StepInventory refactor)

> E2E checklist binario. Cada AC debe pasar antes de marcar el issue como done.
> **NO modificar el verifier para hacer pasar los checks** — si falla, el código está mal.

## Setup

```bash
git checkout main
git pull
git log --oneline -3
```

Verificar que estamos en `main` y tenemos los commits previos de fix-issue-09 y fix-issue-09b.

## AC-1: 6 archivos nuevos en `src/features/properties/components/inventory/` existen

```bash
ls -la src/features/properties/components/inventory/hooks/
ls -la src/features/properties/components/inventory/
```

**Esperado**:

- `inventory/hooks/useInventoryState.ts` ✓
- `inventory/hooks/useInventoryFinalize.ts` ✓
- `inventory/hooks/useInventorySigning.ts` ✓
- `inventory/InventoryConfirmModal.tsx` ✓
- `inventory/InventoryConfigStage.tsx` ✓
- `inventory/InventoryEditingStage.tsx` ✓

**PASS** si los 6 archivos existen. **FAIL** si falta alguno.

---

## AC-2: `StepInventory.tsx` < 400 líneas

```bash
wc -l src/features/properties/components/StepInventory.tsx
```

**PASS** si `< 400`. **FAIL** si `>= 400`.

Reducción esperada: 1028 → ~380 (-63%).

---

## AC-3: Cada archivo nuevo < 250 líneas

```bash
wc -l src/features/properties/components/inventory/**/*.ts src/features/properties/components/inventory/**/*.tsx 2>/dev/null
# Alternativa PowerShell:
Get-ChildItem -Path "src\features\properties\components\inventory" -Recurse -Include "*.ts","*.tsx" | ForEach-Object { "{0,5}: {1}" -f (Get-Content $_.FullName | Measure-Object -Line).Lines, $_.FullName.Replace("D:\desarrollos\Inmocontrol\","") } | Sort-Object
```

**PASS** si todos los 6 archivos tienen < 250 líneas.

Excepción documentada: `useInventoryState.ts` puede llegar a 200 (límite de holgura
para acomodar la lógica de hidratación). Si llega a 220+ es señal de que se podría
dividir más.

---

## AC-4: Cada archivo exporta con `export function`

```bash
grep -E "^export function" src/features/properties/components/inventory/**/*.ts src/features/properties/components/inventory/**/*.tsx
```

**Esperado**: 6 líneas, una por archivo:

- `export function useInventoryState(`
- `export function useInventoryFinalize(`
- `export function useInventorySigning(`
- `export function InventoryConfirmModal(`
- `export function InventoryConfigStage(`
- `export function InventoryEditingStage(`

**PASS** si los 6 exports existen. **FAIL** si alguno falta o usa `export default`.

---

## AC-5: `StepInventory.tsx` importa los 6 nuevos archivos

```bash
grep -E "from \"\./inventory/" src/features/properties/components/StepInventory.tsx
```

**Esperado**: 6 líneas, una por import:

- `from "./inventory/hooks/useInventoryState"`
- `from "./inventory/hooks/useInventoryFinalize"`
- `from "./inventory/hooks/useInventorySigning"`
- `from "./inventory/InventoryConfirmModal"`
- `from "./inventory/InventoryConfigStage"`
- `from "./inventory/InventoryEditingStage"`

**PASS** si los 6 imports existen. **FAIL** si falta alguno o si los hooks/componentes
se redeclaran localmente (buscar `function useInventoryState\|function InventoryConfirmModal`
dentro del archivo — no debe existir).

---

## AC-6.1: `npx tsc --noEmit` exit 0

```bash
npx tsc --noEmit
```

**PASS** si exit code = 0 y NO hay errores de TypeScript.

---

## AC-6.2: `npm test` 80/80 pass

```bash
npm test
```

**PASS** si `tests 80, pass 80, fail 0` (o más, pero nunca menos que 80).

**FAIL** si algún test falla o el conteo baja.

---

## AC-6.3: `PropertiesView.tsx` sigue importando `StepInventory` sin cambios

```bash
grep -n "StepInventory" src/features/properties/PropertiesView.tsx
```

**PASS** si hay 3+ referencias a `StepInventory` (import + uso) y NO se modificó la API
(pasaje de props sigue igual).

**FAIL** si se cambió la firma de `StepInventory`.

---

## AC-6.4: El wizard de inventario funciona idéntico (smoke test manual)

Pasos:

1. `npm run dev` y abrir `http://localhost:3000`
2. Login con un usuario de prueba
3. Abrir el wizard de inventario (propiedad existente o nueva)
4. **Verificar**:
   - El inventario carga desde IndexedDB (o crea uno nuevo si no existe)
   - Las áreas se pueden configurar
   - Las fotos se suben y persisten
   - El draft se guarda en localStorage (recargar la pestaña y ver el toast de "Avance restaurado")
   - El modal de finalización muestra el resumen correcto
   - El PDF se genera y descarga
   - En fase final, el PDF se sube a `Inventarios/` y se copia a `Contrato/` del tenant

**PASS** si todo el flujo funciona idéntico a antes del refactor.

**FAIL** si:

- El inventario no carga
- Las fotos no persisten
- El draft no se restaura
- El PDF no se genera
- El modal de finalización no aparece

---

## Resumen

8 ACs total. Si los 8 pasan, el refactor está completo y se puede mergear a main.

**Última corrida conocida**: _(a llenar cuando se ejecute)_
