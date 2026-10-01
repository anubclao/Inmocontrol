# Verifier #7: Refactor StepDocs.tsx (814 → <200 por archivo)

> **Status**: ⏳ Pending — Karpathy FASE 3.
> **Spec**: [docs/specs/fix-issue-07-refactor-step-docs.md](../../docs/specs/fix-issue-07-refactor-step-docs.md)
> **NO modificar este verifier para hacerlo pasar** (AGENTS.md: si falla, el código está mal).

## Pre-requisitos

- Node 20+
- Shell: PowerShell

---

## AC-1: Estructura target

```powershell
$files = @(
    "src\features\properties\components\StepDocs\index.tsx",
    "src\features\properties\components\StepDocs\StepDocs.tsx",
    "src\features\properties\components\StepDocs\DocCard.tsx",
    "src\features\properties\components\StepDocs\types.ts",
    "src\features\properties\components\StepDocs\hooks\useDocCards.ts"
)
foreach ($f in $files) {
    $exists = Test-Path $f
    Write-Host "  $f`: $exists"
    if (-not $exists) { Write-Host "FAIL: archivo faltante" }
}
```

- **PASS**: 5/5 archivos existen
- **FAIL**: alguno falta

### AC-1.1: El archivo monolítico `StepDocs.tsx` debe estar ELIMINADO

```powershell
Test-Path "src\features\properties\components\StepDocs.tsx"
```

- **PASS**: `False` (eliminado)
- **FAIL**: `True` (queda el monolítico junto con la carpeta)

## AC-2: `StepDocs.tsx` < 200 líneas

```powershell
$stepDocsFile = "src\features\properties\components\StepDocs\StepDocs.tsx"
$lines = (Get-Content $stepDocsFile -Encoding UTF8 | Measure-Object -Line).Lines
Write-Host "StepDocs.tsx lines: $lines"
```

- **PASS**: `$lines -lt 200`
- **FAIL**: `$lines -ge 200`

### AC-2.1: `index.tsx` es un re-export de 1-3 líneas

```powershell
$indexLines = (Get-Content "src\features\properties\components\StepDocs\index.tsx" -Encoding UTF8 | Measure-Object -Line).Lines
```

- **PASS**: 1-3 líneas
- **FAIL**: >3

## AC-3: `DocCard.tsx` separado

```powershell
$docCardFile = "src\features\properties\components\StepDocs\DocCard.tsx"
$docCardLines = (Get-Content $docCardFile -Encoding UTF8 | Measure-Object -Line).Lines
```

- **PASS**: `$docCardLines -lt 200`
- **FAIL**: `$docCardLines -ge 200`

### AC-3.1: `DocCard` está exportado

```powershell
Select-String -Path $docCardFile -Pattern "^export (function|const) DocCard"
```

- **PASS**: match
- **FAIL**: no export

### AC-3.2: `DocCard` no re-define `DocCardProps`

```powershell
$content = Get-Content $docCardFile -Raw
$content -notmatch "^(export )?interface DocCardProps\b"
```

- **PASS**: `True` (no está duplicado)
- **FAIL**: `False` (duplicado)

## AC-4: Hook `useDocCards` con funciones puras

```powershell
$hookFile = "src\features\properties\components\StepDocs\hooks\useDocCards.ts"
$content = Get-Content $hookFile -Raw
$expectedFunctions = @("buildRequiredSlots", "labelForKey", "countInSlot", "iconForKey", "getDocStorageState")
foreach ($fn in $expectedFunctions) {
    if ($content -match "export function $fn\b" -or $content -match "export const $fn\b") {
        Write-Host "  OK: $fn"
    } else {
        Write-Host "  MISSING: $fn"
    }
}
```

- **PASS**: 5/5 funciones exportadas
- **FAIL**: alguna falta

## AC-5: `types.ts` centraliza los types

```powershell
$typesFile = "src\features\properties\components\StepDocs\types.ts"
$content = Get-Content $typesFile -Raw
$expectedTypes = @("DocStorageState", "DocSlotKey", "UploadedDocsMap", "StepDocsProps", "DocCardProps")
foreach ($t in $expectedTypes) {
    if ($content -match "\b$t\b") {
        Write-Host "  OK: $t"
    } else {
        Write-Host "  MISSING: $t"
    }
}
```

- **PASS**: 5/5 types presentes
- **FAIL**: alguno falta

### AC-5.1: Cero type duplicado en StepDocs.tsx

```powershell
$stepDocsContent = Get-Content $stepDocsFile -Raw
foreach ($t in @("DocStorageState", "DocSlotKey", "UploadedDocsMap", "StepDocsProps", "DocCardProps")) {
    if ($stepDocsContent -match "^(export )?(type|interface) $t\b") {
        Write-Host "FAIL: $t duplicado en StepDocs.tsx"
    }
}
```

- **PASS**: 0 types duplicados
- **FAIL**: alguno duplicado

## AC-6: Imports limpios

```powershell
$stepDocsContent = Get-Content $stepDocsFile -Raw
$stepDocsContent -match "from ['""]lucide-react['""]"
```

- **PASS**: `False` (icons vienen del hook)
- **FAIL**: `True`

## AC-7: Cero cambio funcional observable

### AC-7.1: tsc --noEmit pasa

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

- **PASS**: exit 0
- **FAIL**: exit != 0

### AC-7.2: Tests siguen pasando

```powershell
npm test
```

- **PASS**: 80/80 tests
- **FAIL**: <80 tests o algún fail

## AC-8: Re-export backward-compatible

```powershell
# PropertiesView.tsx u otro caller debe seguir importando StepDocs sin cambios
$pvFile = "src\features\properties\PropertiesView.tsx"
$content = Get-Content $pvFile -Raw
$content -match "import StepDocs from ['""]\.\.?/components/StepDocs['""]"
```

- **PASS**: match (path-based funciona con StepDocs/index.tsx)
- **FAIL**: no match

## Resumen del verifier

| AC  | Descripción                   | Cómo verificar | Estado |
| --- | ----------------------------- | -------------- | ------ |
| 1   | 5 archivos existen            | test-path × 5  | ⏳     |
| 1.1 | Monolito eliminado            | test-path      | ⏳     |
| 2   | StepDocs.tsx < 200            | line count     | ⏳     |
| 2.1 | index.tsx ≤ 3                 | line count     | ⏳     |
| 3   | DocCard.tsx < 200             | line count     | ⏳     |
| 3.1 | DocCard exportado             | grep           | ⏳     |
| 3.2 | DocCardProps no duplicado     | grep           | ⏳     |
| 4   | 5 funciones en hook           | grep           | ⏳     |
| 5   | 5 types en types.ts           | grep           | ⏳     |
| 5.1 | 0 types duplicados            | grep           | ⏳     |
| 6   | Sin import lucide en StepDocs | grep           | ⏳     |
| 7.1 | tsc pasa                      | tsc            | ⏳     |
| 7.2 | Tests pasan                   | npm test       | ⏳     |
| 8   | Import path-based funciona    | grep           | ⏳     |

## Antes de implementar (baseline esperado)

Correr este verifier contra el estado actual. **DEBE fallar en AC-1, AC-1.1, AC-2, AC-3, AC-4, AC-5**.

## Después de implementar

Correr el verifier completo. Debe pasar TODOS los ACs.

---

**Status:** ⏳ Pending
