# Verifier #6: TenantsView refactor (1910 → <250 + 9 archivos <200)

> **Status**: ⏳ Pending — Karpathy FASE 3.
> **Spec**: [docs/specs/fix-issue-06-refactor-tenants-view.md](../../docs/specs/fix-issue-06-refactor-tenants-view.md)
> **NO modificar este verifier para hacerlo pasar** (AGENTS.md: si falla, el código está mal).

## Pre-requisitos

- Node 20+
- Shell: PowerShell
- Working tree: clean (empezar desde `main` con `git status` vacío)

---

## AC-1: 10 archivos existen

```powershell
$files = @(
    "src\features\tenants\types.ts",
    "src\features\tenants\hooks\useCreateTenant.ts",
    "src\features\tenants\hooks\useTenantDrive.ts",
    "src\features\tenants\modals\CreateTenantModal.tsx",
    "src\features\tenants\modals\ConfirmCreateModal.tsx",
    "src\features\tenants\modals\EditTenantModal.tsx",
    "src\features\tenants\modals\ViewTenantModal.tsx",
    "src\features\tenants\modals\DeleteTenantModal.tsx",
    "src\features\tenants\modals\UploadAnotherDocModal.tsx",
    "src\features\tenants\modals\PlacementInventoryOverlay.tsx"
)
$ok = $true
foreach ($f in $files) {
    $exists = Test-Path $f
    Write-Host "  $f`: $exists"
    if (-not $exists) { $ok = $false; Write-Host "FAIL: archivo faltante" -ForegroundColor Red }
}
Write-Host "AC-1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 10/10 archivos existen
- **FAIL**: alguno falta

## AC-2: `TenantsView.tsx` < 250 líneas

```powershell
$tvFile = "src\features\tenants\TenantsView.tsx"
$lines = (Get-Content $tvFile -Encoding UTF8 | Measure-Object -Line).Lines
Write-Host "TenantsView.tsx lines: $lines"
```

- **PASS**: `$lines -lt 250`
- **FAIL**: `$lines -ge 250`

### AC-2.1: TenantsView sigue exportando `TenantsView` (named) y `TenantsViewProps`

```powershell
$content = Get-Content $tvFile -Raw
$content -match "^export function TenantsView\b"
$content -match "^export interface TenantsViewProps\b"
```

- **PASS**: ambos matchean
- **FAIL**: alguno no matchea

## AC-3: Cada archivo nuevo < 200 líneas

```powershell
$files = @(
    "src\features\tenants\types.ts",
    "src\features\tenants\hooks\useCreateTenant.ts",
    "src\features\tenants\hooks\useTenantDrive.ts",
    "src\features\tenants\modals\CreateTenantModal.tsx",
    "src\features\tenants\modals\ConfirmCreateModal.tsx",
    "src\features\tenants\modals\EditTenantModal.tsx",
    "src\features\tenants\modals\ViewTenantModal.tsx",
    "src\features\tenants\modals\DeleteTenantModal.tsx",
    "src\features\tenants\modals\UploadAnotherDocModal.tsx",
    "src\features\tenants\modals\PlacementInventoryOverlay.tsx"
)
$ok = $true
foreach ($f in $files) {
    $n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    Write-Host "  $f`: $n"
    if ($n -ge 200) { $ok = $false; Write-Host "FAIL: $f tiene $n lineas (>=200)" -ForegroundColor Red }
}
Write-Host "AC-3: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 10/10 archivos < 200 líneas
- **FAIL**: alguno >= 200

## AC-4: `types.ts` centraliza los types

```powershell
$typesFile = "src\features\tenants\types.ts"
$content = Get-Content $typesFile -Raw
$expected = @(
    "Tenant",
    "TenantsViewProps",
    "UploadFolderStatus",
    "UploadStatusMap",
    "ActaStatus",
    "DriveFolder"
)
$ok = $true
foreach ($t in $expected) {
    if ($content -match "\b$t\b") {
        Write-Host "  OK: $t"
    } else {
        Write-Host "  MISSING: $t"
        $ok = $false
    }
}
Write-Host "AC-4: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 6/6 types presentes
- **FAIL**: alguno falta

### AC-4.1: `Tenant` y `TenantsViewProps` no duplicados en TenantsView.tsx

```powershell
$tvContent = Get-Content "src\features\tenants\TenantsView.tsx" -Raw
$tvContent -notmatch "^interface Tenant\b"  # no re-declara Tenant
$tvContent -notmatch "^interface TenantsViewProps\b"  # no re-declara TenantsViewProps
```

- **PASS**: ninguno redeclarado
- **FAIL**: alguno duplicado

## AC-5: `useCreateTenant.ts` exporta el hook

```powershell
$hookFile = "src\features\tenants\hooks\useCreateTenant.ts"
$content = Get-Content $hookFile -Raw
$content -match "^export function useCreateTenant\b"
```

- **PASS**: match
- **FAIL**: no exporta

### AC-5.1: El hook devuelve las 9 funciones/state esperadas

```powershell
$expected = @(
    "form",
    "formErrors",
    "isCreateModalOpen",
    "setIsCreateModalOpen",
    "confirmCreateOpen",
    "setConfirmCreateOpen",
    "creatingTenant",
    "handleAskCreate",
    "handleConfirmAndCreate",
    "handleIdNumberChange",
    "handleCloseCreate"
)
$ok = $true
foreach ($e in $expected) {
    if ($content -match "\b$e\b") { Write-Host "  OK: $e" } else { Write-Host "  MISSING: $e"; $ok = $false }
}
Write-Host "AC-5.1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 11/11 presentes
- **FAIL**: alguno falta

## AC-6: `useTenantDrive.ts` exporta el hook

```powershell
$hookFile = "src\features\tenants\hooks\useTenantDrive.ts"
$content = Get-Content $hookFile -Raw
$content -match "^export function useTenantDrive\b"
```

- **PASS**: match
- **FAIL**: no exporta

### AC-6.1: El hook expone `ensureTenantDriveFolder`, `refreshCedulaStatus`, `refreshActaStatus`, `handleDocUpload`

```powershell
$expected = @("ensureTenantDriveFolder", "refreshCedulaStatus", "refreshActaStatus", "handleDocUpload", "uploadStatus", "actaStatus", "lastUploadedFolder")
$ok = $true
foreach ($e in $expected) {
    if ($content -match "\b$e\b") { Write-Host "  OK: $e" } else { Write-Host "  MISSING: $e"; $ok = $false }
}
Write-Host "AC-6.1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 7/7 presentes
- **FAIL**: alguno falta

## AC-7: Cada modal exporta su componente

```powershell
$modals = @{
    "CreateTenantModal" = "src\features\tenants\modals\CreateTenantModal.tsx"
    "ConfirmCreateModal" = "src\features\tenants\modals\ConfirmCreateModal.tsx"
    "EditTenantModal" = "src\features\tenants\modals\EditTenantModal.tsx"
    "ViewTenantModal" = "src\features\tenants\modals\ViewTenantModal.tsx"
    "DeleteTenantModal" = "src\features\tenants\modals\DeleteTenantModal.tsx"
    "UploadAnotherDocModal" = "src\features\tenants\modals\UploadAnotherDocModal.tsx"
    "PlacementInventoryOverlay" = "src\features\tenants\modals\PlacementInventoryOverlay.tsx"
}
$ok = $true
foreach ($name in $modals.Keys) {
    $f = $modals[$name]
    $c = Get-Content $f -Raw
    if ($c -match "^export function $name\b") { Write-Host "  OK: $name" } else { Write-Host "  MISSING: $name"; $ok = $false }
}
Write-Host "AC-7: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 7/7 modales exportan
- **FAIL**: alguno falta

## AC-8: Imports limpios en TenantsView.tsx

```powershell
$tvContent = Get-Content "src\features\tenants\TenantsView.tsx" -Raw
$ok = $true
# Estos imports/uses NO deben estar en TenantsView.tsx (salieron al refactor)
$shouldNot = @("StepInventory", "inventoryDB", "createContractServer", "useContractStore", "BillingSetupWizard", "formatIdNumber", "formatTenantName", "fileToBase64")
foreach ($s in $shouldNot) {
    if ($tvContent -match "\b$s\b") {
        Write-Host "  WARN: $s todavía aparece en TenantsView.tsx (puede ser type-only import o constante)" -ForegroundColor Yellow
    } else {
        Write-Host "  OK: $s no aparece en TenantsView.tsx"
    }
}
```

- **PASS (informativo)**: warning si alguno aparece, no falla el test
- Solo para revisión manual: si aparece, ¿es legítimo? (ej: type-only import, prop forwarding)

## AC-9: Cero cambio funcional observable

### AC-9.1: tsc --noEmit pasa

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

- **PASS**: exit 0
- **FAIL**: exit != 0

### AC-9.2: Tests siguen pasando

```powershell
npm test
```

- **PASS**: 80/80 tests (mismo baseline que fix-issue-07)
- **FAIL**: <80 tests o algún fail

### AC-9.3: App.tsx sigue importando TenantsView sin cambios

```powershell
$appFile = "src\App.tsx"
$content = Get-Content $appFile -Raw
$content -match "import \{ TenantsView \} from ['""]\./features/tenants/TenantsView['""]"
```

- **PASS**: match (sin cambios)
- **FAIL**: el path cambió

## AC-10: Cada archivo nuevo importa los types (no redeclara)

```powershell
$files = @(
    "src\features\tenants\hooks\useCreateTenant.ts",
    "src\features\tenants\hooks\useTenantDrive.ts",
    "src\features\tenants\modals\CreateTenantModal.tsx",
    "src\features\tenants\modals\ConfirmCreateModal.tsx",
    "src\features\tenants\modals\EditTenantModal.tsx",
    "src\features\tenants\modals\ViewTenantModal.tsx",
    "src\features\tenants\modals\DeleteTenantModal.tsx",
    "src\features\tenants\modals\UploadAnotherDocModal.tsx",
    "src\features\tenants\modals\PlacementInventoryOverlay.tsx"
)
$ok = $true
foreach ($f in $files) {
    $c = Get-Content $f -Raw
    if ($c -match "from ['""]\.\./types['""]" -or $c -match "from ['""]\.\./\.\./types['""]" -or $c -match "from ['""]\.\./\.\./\.\./types['""]") {
        Write-Host "  OK: $f importa types"
    } else {
        Write-Host "  WARN: $f no importa types (puede ser intencional si no los usa)"
    }
}
```

- **PASS (informativo)**: solo warning, no falla
- Para revisión: cada archivo que usa Tenant/TenantsViewProps/UploadFolderStatus/etc. debe importarlo de `./types` (o relativo)

## Resumen del verifier

| AC  | Descripción                      | Cómo verificar  | Estado |
| --- | -------------------------------- | --------------- | ------ |
| 1   | 10 archivos existen              | test-path × 10  | ⏳     |
| 2   | TenantsView.tsx < 250            | line count      | ⏳     |
| 2.1 | TenantsView + Props exportados   | grep            | ⏳     |
| 3   | Cada nuevo archivo < 200         | line count × 10 | ⏳     |
| 4   | 6 types en types.ts              | grep            | ⏳     |
| 4.1 | Tenant/Props no duplicados en TV | grep            | ⏳     |
| 5   | useCreateTenant exporta          | grep            | ⏳     |
| 5.1 | 11 símbolos en useCreateTenant   | grep            | ⏳     |
| 6   | useTenantDrive exporta           | grep            | ⏳     |
| 6.1 | 7 símbolos en useTenantDrive     | grep            | ⏳     |
| 7   | 7 modales exportan               | grep × 7        | ⏳     |
| 8   | Imports limpios en TV            | grep (warn)     | ⏳     |
| 9.1 | tsc pasa                         | tsc             | ⏳     |
| 9.2 | tests pasan                      | npm test        | ⏳     |
| 9.3 | App.tsx sin cambios              | grep            | ⏳     |
| 10  | Imports de types                 | grep (warn)     | ⏳     |

## Después de pasar todos los ACs

1. `git add src/features/tenants/` (todos los archivos nuevos + TenantsView.tsx modificado)
2. Commit 1: `refactor(tenants): modales de create/edit/delete + useCreateTenant (commit 1/2 fix-issue-06)` — incluye types + useCreateTenant + 5 modales (Create, ConfirmCreate, Edit, Delete, UploadAnother). TenantsView todavía tiene el View modal + Drive + Placement overlay inline.
3. Verificar tsc + npm test después del commit 1.
4. Commit 2: `refactor(tenants): ViewTenantModal + useTenantDrive + PlacementInventoryOverlay (commit 2/2 fix-issue-06)` — incluye useTenantDrive + ViewTenantModal + PlacementInventoryOverlay. TenantsView queda como lista + stats + state compartido.
5. Verificar tsc + npm test después del commit 2.
6. `git push origin main`.
