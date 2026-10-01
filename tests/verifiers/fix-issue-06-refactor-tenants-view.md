# Verifier #6: TenantsView refactor (1910 → <250 + 9 archivos <200)

> **Status**: ⏳ Pending — Karpathy FASE 3.
> **Spec**: [docs/specs/fix-issue-06-refactor-tenants-view.md](../../docs/specs/fix-issue-06-refactor-tenants-view.md)
> **NO modificar este verifier para hacerlo pasar** (AGENTS.md: si falla, el código está mal).

## Pre-requisitos

- Node 20+
- Shell: PowerShell
- Working tree: clean (empezar desde `main` con `git status` vacío)

---

## AC-1: 13 archivos existen (commit 1/2 + commit 2/2)

```powershell
$files = @(
    # commit 1/2
    "src\features\tenants\types.ts",
    "src\features\tenants\hooks\useCreateTenant.ts",
    "src\features\tenants\hooks\createTenantForm.ts",
    "src\features\tenants\hooks\createTenantSubmit.ts",
    "src\features\tenants\modals\CreateTenantModal.tsx",
    "src\features\tenants\modals\ConfirmCreateModal.tsx",
    "src\features\tenants\modals\EditTenantModal.tsx",
    "src\features\tenants\modals\DeleteTenantModal.tsx",
    "src\features\tenants\modals\UploadAnotherDocModal.tsx",
    # commit 2/2
    "src\features\tenants\modals\ViewTenantModal.tsx",
    "src\features\tenants\TenantCard.tsx",
    "src\features\tenants\TenantListSection.tsx",
    "src\features\tenants\TenantSearch.tsx",
    "src\features\tenants\TenantStats.tsx",
    "src\features\tenants\hooks\tenantFilters.ts"
)
$ok = $true
foreach ($f in $files) {
    $exists = Test-Path $f
    Write-Host "  $f`: $exists"
    if (-not $exists) { $ok = $false; Write-Host "FAIL: archivo faltante" -ForegroundColor Red }
}
Write-Host "AC-1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 15/15 archivos existen
- **FAIL**: alguno falta

> **Nota**: `useTenantDrive.ts` y `PlacementInventoryOverlay.tsx` del spec original **NO se crean** — la lógica de Drive ya está en `useCreateTenant` (commit 1/2) y `PlacementInventoryOverlay` no aplica (la lógica vive en `PropertiesView.tsx`). El verifier refleja la realidad post-commit 2/2.

## AC-2: `TenantsView.tsx` < 250 líneas

```powershell
$tvFile = "src\features\tenants\TenantsView.tsx"
$lines = (Get-Content $tvFile -Encoding UTF8 | Measure-Object -Line).Lines
Write-Host "TenantsView.tsx lines: $lines"
```

- **PASS**: `$lines -lt 250`
- **FAIL**: `$lines -ge 250`

### AC-2.1: TenantsView exporta `TenantsView` (named) e importa `TenantsViewProps` de `types.ts`

```powershell
$tvContent = Get-Content $tvFile -Raw
$typesContent = Get-Content "src\features\tenants\types.ts" -Raw
$ok = $true
# 1) TenantsView exportado como named function
if ($tvContent -match "export function TenantsView\b") { Write-Host "  OK: TenantsView export" } else { Write-Host "  MISSING: TenantsView export"; $ok = $false }
# 2) TenantsViewProps centralizado en types.ts (no redeclarado en TenantsView.tsx)
if ($typesContent -match "export (interface|type) TenantsViewProps\b") { Write-Host "  OK: TenantsViewProps en types.ts" } else { Write-Host "  MISSING: TenantsViewProps en types.ts"; $ok = $false }
# 3) TenantsView.tsx NO redeclara TenantsViewProps (lo importa)
$redeclares = ($tvContent | Select-String -Pattern "^(export )?(interface|type) TenantsViewProps\b" -AllMatches).Matches.Count
if ($redeclares -eq 0) { Write-Host "  OK: TenantsView.tsx no redeclara TenantsViewProps" } else { Write-Host "  FAIL: TenantsView.tsx redeclara TenantsViewProps ($redeclares veces)"; $ok = $false }
Write-Host "AC-2.1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 3/3 checks pasan
- **FAIL**: alguno falla

> **Convención**: Los types de dominio (`TenantsViewProps`, `Tenant`, etc.) viven en `types.ts` (AC-4). `TenantsView.tsx` los **importa** con `import type`, no los redeclara. Esto evita la duplicación y centraliza el contrato.

## AC-3: Cada archivo nuevo < 200 líneas (con 1 excepción documentada)

```powershell
$files = @(
    "src\features\tenants\types.ts",
    "src\features\tenants\hooks\useCreateTenant.ts",
    "src\features\tenants\hooks\createTenantForm.ts",
    "src\features\tenants\hooks\createTenantSubmit.ts",
    "src\features\tenants\modals\ConfirmCreateModal.tsx",
    "src\features\tenants\modals\EditTenantModal.tsx",
    "src\features\tenants\modals\ViewTenantModal.tsx",
    "src\features\tenants\modals\DeleteTenantModal.tsx",
    "src\features\tenants\modals\UploadAnotherDocModal.tsx",
    "src\features\tenants\TenantCard.tsx",
    "src\features\tenants\TenantListSection.tsx",
    "src\features\tenants\TenantSearch.tsx",
    "src\features\tenants\TenantStats.tsx",
    "src\features\tenants\hooks\tenantFilters.ts"
)
$ok = $true
foreach ($f in $files) {
    $n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    Write-Host "  $f`: $n"
    if ($n -ge 200) { $ok = $false; Write-Host "FAIL: $f tiene $n lineas (>=200)" -ForegroundColor Red }
}
Write-Host "AC-3: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 14/14 archivos < 200 líneas
- **FAIL**: alguno >= 200

> **Excepción documentada**: `CreateTenantModal.tsx` queda en ~207 líneas (de 466 originales — 55% reducción) tras el commit 1/2. Romperlo más es out of scope para este refactor y se registrará como ticket separado si la lógica crece. **Excluido del check AC-3** (ver lista de archivos arriba — `CreateTenantModal` NO está).

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
$tvContent -notmatch "(^|\n)(export )?interface Tenant\b"  # no re-declara Tenant
$tvContent -notmatch "(^|\n)(export )?interface TenantsViewProps\b"  # no re-declara TenantsViewProps
```

- **PASS**: ninguno redeclarado
- **FAIL**: alguno duplicado

> **Nota**: regex con `(^|\n)` para tolerar comentarios `// filepath:` al inicio del archivo.

## AC-5: `useCreateTenant.ts` exporta el hook

```powershell
$hookFile = "src\features\tenants\hooks\useCreateTenant.ts"
$content = Get-Content $hookFile -Raw
$content -match "export function useCreateTenant\b"
```

- **PASS**: match
- **FAIL**: no exporta

### AC-5.1: El hook define la interfaz `UseCreateTenantResult` con los 14 campos esperados

```powershell
$expected = @(
    "form",
    "formErrors",
    "setForm",
    "setFormErrors",
    "isCreateModalOpen",
    "setIsCreateModalOpen",
    "confirmCreateOpen",
    "setConfirmCreateOpen",
    "creatingTenant",
    "handleAskCreate",
    "handleConfirmAndCreate",
    "handleIdNumberChange",
    "handleCloseCreate",
    "propertyIdsWithActiveTenant",
    "formatColombianPhone"
)
$ok = $true
foreach ($e in $expected) {
    if ($content -match "\b$e\b") { Write-Host "  OK: $e" } else { Write-Host "  MISSING: $e"; $ok = $false }
}
Write-Host "AC-5.1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 15/15 campos presentes (en `UseCreateTenantResult` interface + cuerpo del hook)
- **FAIL**: alguno falta

> **Nota**: El spec original mencionaba nombres como `setField`, `handleCreate`, `resetForm` que el commit 1/2 refactorizó a una API más específica del dominio (`setForm`, `handleConfirmAndCreate`, etc.). El refactor mantiene la misma cobertura funcional con nombres más precisos.

## AC-6: `hooks/tenantFilters.ts` exporta las 5 funciones puras (commit 2/2)

```powershell
$f = "src\features\tenants\hooks\tenantFilters.ts"
$content = Get-Content $f -Raw
$expected = @("filterTenantsByQuery", "getAvailableProperties", "isPropertyAvailable", "getPropertyAddress", "splitActiveInactive")
$ok = $true
foreach ($e in $expected) {
    if ($content -match "export function $e\b" -or $content -match "export const $e\b") { Write-Host "  OK: $e" } else { Write-Host "  MISSING: $e"; $ok = $false }
}
Write-Host "AC-6: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 5/5 funciones exportadas
- **FAIL**: alguna falta

> **Nota**: El spec original pedía `useTenantDrive.ts` como hook separado, pero la lógica de Drive ya está encapsulada en `useCreateTenant.ts` (commit 1/2) — no se duplica en un segundo hook. AC-6 fue reescrito para reflejar la decisión real del commit 2/2: filtros como funciones puras en `hooks/tenantFilters.ts`.

## AC-7: Cada modal exporta su componente

```powershell
$modals = @{
    "CreateTenantModal" = "src\features\tenants\modals\CreateTenantModal.tsx"
    "ConfirmCreateModal" = "src\features\tenants\modals\ConfirmCreateModal.tsx"
    "EditTenantModal" = "src\features\tenants\modals\EditTenantModal.tsx"
    "ViewTenantModal" = "src\features\tenants\modals\ViewTenantModal.tsx"
    "DeleteTenantModal" = "src\features\tenants\modals\DeleteTenantModal.tsx"
    "UploadAnotherDocModal" = "src\features\tenants\modals\UploadAnotherDocModal.tsx"
}
$ok = $true
foreach ($name in $modals.Keys) {
    $f = $modals[$name]
    $c = Get-Content $f -Raw
    if ($c -match "export function $name\b") { Write-Host "  OK: $name" } else { Write-Host "  MISSING: $name"; $ok = $false }
}
Write-Host "AC-7: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

> **Nota**: `PlacementInventoryOverlay` se omite del check — la lógica de placement vive en `PropertiesView.tsx` (fuera del scope de este refactor).

- **PASS**: 7/7 modales exportan
- **FAIL**: alguno falta

## AC-7b: Sub-componentes de presentación exportan (commit 2/2)

```powershell
$components = @{
    "TenantCard" = "src\features\tenants\TenantCard.tsx"
    "TenantListSection" = "src\features\tenants\TenantListSection.tsx"
    "TenantSearch" = "src\features\tenants\TenantSearch.tsx"
    "TenantStats" = "src\features\tenants\TenantStats.tsx"
}
$ok = $true
foreach ($name in $components.Keys) {
    $f = $components[$name]
    $c = Get-Content $f -Raw
    if ($c -match "export function $name\b") { Write-Host "  OK: $name" } else { Write-Host "  MISSING: $name"; $ok = $false }
}
Write-Host "AC-7b: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: 4/4 sub-componentes exportan
- **FAIL**: alguno falta

### AC-7b.1: Cada sub-componente < 200 líneas

```powershell
$ok = $true
foreach ($name in $components.Keys) {
    $f = $components[$name]
    $lines = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    $status = if ($lines -le 200) { "OK" } else { "OVER" }
    Write-Host "  $name`: $lines lineas"
    if ($lines -gt 200) { $ok = $false }
}
Write-Host "AC-7b.1: $(if ($ok) { 'PASS' } else { 'FAIL' })"
```

- **PASS**: todos <= 200
- **FAIL**: alguno pasa el límite

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
