# Verifier — fix-issue-23 (appStore refactor)

## AC-1: 8 archivos nuevos existen

```powershell
$files = @(
    "src\shared\store\appStore\types.ts"
    "src\shared\store\appStore\api.ts"
    "src\shared\store\appStore\selectors.ts"
    "src\shared\store\appStore\slices\propertiesCrudSlice.ts"
    "src\shared\store\appStore\slices\propertiesFetchSlice.ts"
    "src\shared\store\appStore\slices\tenantsSlice.ts"
    "src\shared\store\appStore\slices\financialSlice.ts"
    "src\shared\store\appStore\slices\hydrateSlice.ts"
)
$ok = $true
foreach ($f in $files) {
    if (Test-Path $f) { "  OK: $f" } else { "  MISSING: $f"; $ok = $false }
}
"AC-1: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-2: `appStore.ts` < 50 líneas

```powershell
$n = (Get-Content "src\shared\store\appStore.ts" -Encoding UTF8 | Measure-Object -Line).Lines
"AC-2: $(if ($n -lt 50) {'PASS ('+$n+')'} else {'FAIL ('+$n+')'})"
```

## AC-3: Cada archivo nuevo < 250 líneas

```powershell
$files = Get-ChildItem "src\shared\store\appStore" -Recurse -File -Filter "*.ts" | ForEach-Object { $_.FullName.Replace('D:\desarrollos\Inmocontrol\','') }
$ok = $true
foreach ($f in $files) {
    $n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    "  $f`: $n"
    if ($n -ge 250) { $ok = $false }
}
"AC-3: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-4: tsc --noEmit

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

## AC-5: 80/80 tests

```powershell
npm test
```

## AC-6: importadores externos

```powershell
Get-ChildItem src -Recurse -File -Include "*.ts","*.tsx" | Select-String "from ['\"].*shared/store/appStore['\"]" | ForEach-Object { $_.Path.Replace("D:\desarrollos\Inmocontrol\","") }
"AC-6: PASS si hay al menos 5 importadores"
```
