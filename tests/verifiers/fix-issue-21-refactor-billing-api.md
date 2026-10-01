# Verifier — fix-issue-21 (billing/api.ts refactor)

> E2E checklist binario. Cada AC debe pasar antes de marcar el issue como done.

## AC-1: 14 archivos nuevos en `src/features/billing/api/`

```powershell
$files = @(
    "src\features\billing\api\_internal.ts"
    "src\features\billing\api\policiesApi.ts"
    "src\features\billing\api\amortizationApi.ts"
    "src\features\billing\api\discountsApi.ts"
    "src\features\billing\api\chargesApi.ts"
    "src\features\billing\api\rentIncreasesApi.ts"
    "src\features\billing\api\accountStatementApi.ts"
    "src\features\billing\api\invoicesApi.ts"
    "src\features\billing\api\ownerPayoutsApi.ts"
    "src\features\billing\api\ownerStatementApi.ts"
    "src\features\billing\api\actionsApi.ts"
    "src\features\billing\api\bankAccountsApi.ts"
    "src\features\billing\api\insuranceApi.ts"
    "src\features\billing\api\apiModeApi.ts"
)
$ok = $true
foreach ($f in $files) {
    if (Test-Path $f) { "  OK: $f" } else { "  MISSING: $f"; $ok = $false }
}
"AC-1: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-2: `src/features/billing/api.ts` < 50 líneas (solo re-exports)

```powershell
$tv = "src\features\billing\api.ts"
$n = (Get-Content $tv -Encoding UTF8 | Measure-Object -Line).Lines
"AC-2: $(if ($n -lt 50) {'PASS ('+$n+')'} else {'FAIL ('+$n+')'})"
```

## AC-3: Cada archivo nuevo < 250 líneas

```powershell
$files = @(
    "src\features\billing\api\_internal.ts"
    "src\features\billing\api\policiesApi.ts"
    "src\features\billing\api\amortizationApi.ts"
    "src\features\billing\api\discountsApi.ts"
    "src\features\billing\api\chargesApi.ts"
    "src\features\billing\api\rentIncreasesApi.ts"
    "src\features\billing\api\accountStatementApi.ts"
    "src\features\billing\api\invoicesApi.ts"
    "src\features\billing\api\ownerPayoutsApi.ts"
    "src\features\billing\api\ownerStatementApi.ts"
    "src\features\billing\api\actionsApi.ts"
    "src\features\billing\api\bankAccountsApi.ts"
    "src\features\billing\api\insuranceApi.ts"
    "src\features\billing\api\apiModeApi.ts"
)
$ok = $true
foreach ($f in $files) {
    $n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    "  $f`: $n"
    if ($n -ge 250) { $ok = $false }
}
"AC-3: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-4: `api.ts` re-exporta desde `./api/*`

```powershell
$tv = "src\features\billing\api.ts"
$content = Get-Content $tv -Raw
$ok = $true
$expected = @(
    "from './api/policiesApi'"
    "from './api/amortizationApi'"
    "from './api/discountsApi'"
    "from './api/chargesApi'"
    "from './api/rentIncreasesApi'"
    "from './api/accountStatementApi'"
    "from './api/invoicesApi'"
    "from './api/ownerPayoutsApi'"
    "from './api/ownerStatementApi'"
    "from './api/actionsApi'"
    "from './api/bankAccountsApi'"
    "from './api/insuranceApi'"
    "from './api/apiModeApi'"
)
foreach ($e in $expected) {
    if ($content -match [regex]::Escape($e)) { "  OK: $e" } else { "  FAIL: missing $e"; $ok = $false }
}
"AC-4: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-5.1: tsc --noEmit exit 0

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

## AC-5.2: tests 80/80

```powershell
npm test
```

## AC-6: `FinancialView.tsx` sigue importando de `../billing/api` sin cambios

```powershell
$fv = "src\features\financial\FinancialView.tsx"
$c = Get-Content $fv -Raw
"AC-6: $(if ($c -match [regex]::Escape(\"from '../billing/api'\")) {'PASS'} else {'FAIL'})"
```
