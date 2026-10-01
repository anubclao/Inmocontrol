# Verifier — fix-issue-17 (DashboardView refactor)

> E2E checklist binario. Cada AC debe pasar antes de marcar el issue como done.
> **NO modificar el verifier para hacer pasar los checks** — si falla, el código está mal.

## AC-1: Archivo `AlertsModalBody.tsx` existe

```powershell
$f = "src\features\dashboard\components\AlertsModalBody.tsx"
if (Test-Path $f) { "AC-1: PASS" } else { "AC-1: FAIL (no existe $f)" }
```

## AC-2: `DashboardView.tsx` < 220 líneas

```powershell
$tv = "src\features\dashboard\DashboardView.tsx"
$n = (Get-Content $tv -Encoding UTF8 | Measure-Object -Line).Lines
if ($n -lt 220) { "AC-2: PASS ($n líneas)" } else { "AC-2: FAIL ($n líneas, >=220)" }
```

## AC-3: `AlertsModalBody.tsx` < 250 líneas

```powershell
$f = "src\features\dashboard\components\AlertsModalBody.tsx"
$n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
if ($n -lt 250) { "AC-3: PASS ($n líneas)" } else { "AC-3: FAIL ($n líneas, >=250)" }
```

## AC-4: `AlertsModalBody` se exporta como `export function`

```powershell
$f = "src\features\dashboard\components\AlertsModalBody.tsx"
$c = Get-Content $f -Raw
if ($c -match "export function AlertsModalBody\b") { "AC-4: PASS" } else { "AC-4: FAIL" }
```

## AC-5: `DashboardView.tsx` importa `AlertsModalBody` y NO lo redeclara

```powershell
$tv = "src\features\dashboard\DashboardView.tsx"
$content = Get-Content $tv -Raw
$ok = $true
$il = Select-String -Path $tv -Pattern "from .*components/AlertsModalBody"
if ($il) { "  OK: import" } else { "  FAIL: no import"; $ok = $false }
$r = ([regex]::Matches($content, "(^|\n)(export )?function AlertsModalBody\b")).Count
if ($r -eq 0) { "  OK: no redeclarado" } else { "  FAIL: redeclarado"; $ok = $false }
if ($ok) { "AC-5: PASS" } else { "AC-5: FAIL" }
```

## AC-6.1: `npx tsc --noEmit` exit 0

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

## AC-6.2: `npm test` 80/80 pass

```powershell
npm test
```
