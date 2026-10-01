# Verifier — fix-issue-18 (StepBasic refactor)

> E2E checklist binario. Cada AC debe pasar antes de marcar el issue como done.
> **NO modificar el verifier para hacer pasar los checks** — si falla, el código está mal.

## AC-1: 2 archivos nuevos existen

```powershell
$files = @(
    "src\features\properties\components\stepBasic\WizardOwnersSection.tsx",
    "src\features\properties\components\stepBasic\WizardUnitsSection.tsx"
)
$ok = $true
foreach ($f in $files) {
    if (Test-Path $f) { "  OK: $f" } else { "  MISSING: $f"; $ok = $false }
}
"AC-1: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-2: `StepBasic.tsx` < 250 líneas

```powershell
$tv = "src\features\properties\components\StepBasic.tsx"
$n = (Get-Content $tv -Encoding UTF8 | Measure-Object -Line).Lines
"AC-2: $(if ($n -lt 250) {'PASS ('+$n+')'} else {'FAIL ('+$n+')'})"
```

## AC-3: Cada archivo nuevo < 250 líneas

```powershell
$files = @(
    "src\features\properties\components\stepBasic\WizardOwnersSection.tsx",
    "src\features\properties\components\stepBasic\WizardUnitsSection.tsx"
)
$ok = $true
foreach ($f in $files) {
    $n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    "  $f`: $n"
    if ($n -ge 250) { $ok = $false }
}
"AC-3: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-4: Componentes exportados

```powershell
$ok = $true
$checks = @{
    "WizardOwnersSection" = "src\features\properties\components\stepBasic\WizardOwnersSection.tsx"
    "WizardUnitsSection" = "src\features\properties\components\stepBasic\WizardUnitsSection.tsx"
}
foreach ($n in $checks.Keys) {
    $c = Get-Content $checks[$n] -Raw
    if ($c -match "export function $n\b") { "  OK: $n" } else { "  FAIL: $n no exportado"; $ok = $false }
}
"AC-4: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-5: `StepBasic.tsx` importa las 2 secciones y NO las redeclara

```powershell
$tv = "src\features\properties\components\StepBasic.tsx"
$content = Get-Content $tv -Raw
$ok = $true
$tabs = @("WizardOwnersSection", "WizardUnitsSection")
foreach ($n in $tabs) {
    $il = Select-String -Path $tv -Pattern "from .*stepBasic/$n"
    if ($il) { "  OK: import $n" } else { "  FAIL: no import $n"; $ok = $false }
}
foreach ($n in $tabs) {
    $r = ([regex]::Matches($content, "(^|\n)(export )?function $n\b")).Count
    if ($r -eq 0) { "  OK: $n no redeclarado" } else { "  FAIL: $n redeclarado"; $ok = $false }
}
"AC-5: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-6.1: tsc --noEmit exit 0

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

## AC-6.2: tests 80/80

```powershell
npm test
```
