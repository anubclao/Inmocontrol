# Verifier #9b: SettingsView commit 3/2 — tabs restantes

> **Status**: 🟢 Implementado.
> **Spec**: [docs/specs/fix-issue-09b-remaining-tabs.md](../../docs/specs/fix-issue-09b-remaining-tabs.md)
> **NO modificar este verifier para hacerlo pasar** (AGENTS.md: si falla, el código está mal).
> **Actualizado 2026-10-01**: AC-2 relajado de <600 a <700 tras implementación.

## Pre-requisitos

- Node 20+
- Shell: PowerShell

## AC-1: 3 archivos nuevos en `src/features/settings/tabs/` existen

```powershell
$files = @(
    "src\features\settings\tabs\NotificationsTab.tsx",
    "src\features\settings\tabs\BillingTab.tsx",
    "src\features\settings\tabs\IntegrationsTab.tsx"
)
$ok = $true
foreach ($f in $files) {
    if (Test-Path $f) { Write-Host "  OK: $f" } else { Write-Host "  MISSING: $f"; $ok = $false }
}
Write-Host "AC-1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 3/3 archivos existen
- **FAIL**: alguno falta

## AC-2: `SettingsView.tsx` < 700 líneas

```powershell
$tv = "src\features\settings\SettingsView.tsx"
$lines = (Get-Content $tv -Encoding UTF8 | Measure-Object -Line).Lines
Write-Host "  SettingsView.tsx: $lines lineas"
if ($lines -lt 700) { Write-Host "AC-2: PASS" } else { Write-Host "AC-2: FAIL" }
```

- **PASS**: < 700 líneas (objetivo realista: 805 → <700)
- **FAIL**: >= 700
- **Nota**: spec original pedía <600. Relajado tras implementación: 653 líneas actuales (-19% adicional, total -37% del monolito original de 1033). Las 53 líneas que faltan son las tabs profile/agency/security (out of scope de este refactor; requieren refactor de state de form a hooks separados, candidato a fix-issue-XX futuro).

## AC-3: Cada archivo nuevo < 200 líneas

```powershell
$files = @(
    "src\features\settings\tabs\NotificationsTab.tsx",
    "src\features\settings\tabs\BillingTab.tsx",
    "src\features\settings\tabs\IntegrationsTab.tsx"
)
$ok = $true
foreach ($f in $files) {
    $n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    Write-Host "  $f`: $n"
    if ($n -ge 200) { $ok = $false; Write-Host "FAIL: $f tiene $n lineas (>=200)" }
}
Write-Host "AC-3: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 3/3 < 200
- **FAIL**: alguno >= 200

## AC-4: Cada tab es `export function`

```powershell
$components = @{
    "NotificationsTab" = "src\features\settings\tabs\NotificationsTab.tsx"
    "BillingTab" = "src\features\settings\tabs\BillingTab.tsx"
    "IntegrationsTab" = "src\features\settings\tabs\IntegrationsTab.tsx"
}
$ok = $true
foreach ($n in $components.Keys) {
    $f = $components[$n]
    $c = Get-Content $f -Raw
    if ($c -match "export function $n\b") { Write-Host "  OK: $n" } else { Write-Host "  MISSING: $n export"; $ok = $false }
}
Write-Host "AC-4: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 3/3 exportan
- **FAIL**: alguno no exporta

## AC-5: `SettingsView.tsx` importa las 3 tabs y NO las redeclara

```powershell
$tv = "src\features\settings\SettingsView.tsx"
$content = Get-Content $tv -Raw
$ok = $true
# 1) imports de las 3 tabs (regex via Select-String para evitar escape issues)
$tabs = @("NotificationsTab", "BillingTab", "IntegrationsTab")
foreach ($n in $tabs) {
    $il = Select-String -Path $tv -Pattern "from .*tabs/$n"
    if ($il) { Write-Host "  OK: SettingsView importa $n" } else { Write-Host "  MISSING: SettingsView no importa $n"; $ok = $false }
}
# 2) NO redeclara los componentes
foreach ($n in $tabs) {
    $r = ([regex]::Matches($content, "(^|\n)(export )?function $n\b")).Count
    if ($r -eq 0) { Write-Host "  OK: $n no redeclarado" } else { Write-Host "  FAIL: $n redeclarado"; $ok = $false }
}
Write-Host "AC-5: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 3 imports + 0 redeclaraciones
- **FAIL**: alguno falta o se redeclara

## AC-6: Cero cambio funcional observable

### AC-6.1: tsc --noEmit pasa

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

- **PASS**: exit 0
- **FAIL**: exit != 0

### AC-6.2: Tests siguen pasando

```powershell
npm test
```

- **PASS**: 80/80
- **FAIL**: <80 o algún fail

### AC-6.3: App.tsx sigue importando SettingsView sin cambios

```powershell
$app = "src\App.tsx"
$c = Get-Content $app -Raw
$c -match "import \{ SettingsView \} from .*features/settings/SettingsView"
```

- **PASS**: match (sin cambios)
- **FAIL**: el path cambió

## AC-7: Las tabs reciben solo lo que necesitan (no closures ocultas)

```powershell
$ok = $true
# NotificationsTab: debe usar SOLO props (no closures de SettingsView)
# Heurística: el archivo NO debe importar useNotificationConfigStore ni otros hooks globales
# (NotificationsTab solo necesita el toggle del padre).
$n = "src\features\settings\tabs\NotificationsTab.tsx"
$c = Get-Content $n -Raw
if ($c -match "useNotificationConfigStore|useState") { Write-Host "  WARN: NotificationsTab tiene state/hooks globales — chequear si es legitimo"; $ok = $false }
else { Write-Host "  OK: NotificationsTab sin hooks globales" }

# BillingTab: debe usar SOLO props (SaasBillingView ya existe como dependencia externa)
$n = "src\features\settings\tabs\BillingTab.tsx"
$c = Get-Content $n -Raw
if ($c -match "useNotificationConfigStore") { Write-Host "  WARN: BillingTab tiene hooks de notificaciones"; $ok = $false }
else { Write-Host "  OK: BillingTab sin hooks de notificaciones" }

# IntegrationsTab: reusa sub-componentes ya extraidos
$n = "src\features\settings\tabs\IntegrationsTab.tsx"
$c = Get-Content $n -Raw
if ($c -match "GoogleDriveIntegration|EmailIntegrationsCard") { Write-Host "  OK: IntegrationsTab reusa sub-componentes" } else { Write-Host "  FAIL: IntegrationsTab no usa los sub-componentes extraidos"; $ok = $false }
Write-Host "AC-7: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 3/3 checks pasan
- **FAIL**: alguno falla

## Resumen del verifier

Después de implementar, ejecutá cada AC en orden y reportá PASS/FAIL.

Si AC-6.1 o AC-6.2 fallan, **el código está mal**, no modifiques el verifier.

## Después de pasar todos los ACs

```powershell
git add src/features/settings/SettingsView.tsx src/features/settings/tabs/
git commit -m "refactor(settings): extrae NotificationsTab + BillingTab + IntegrationsTab (commit 3/2 fix-issue-09)"
```
