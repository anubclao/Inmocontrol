# Verifier — fix-issue-22 (inventoryConfig refactor)

> E2E checklist binario. Cada AC debe pasar antes de marcar el issue como done.

## AC-1: 11 archivos nuevos existen

```powershell
$files = @(
    "src\features\properties\inventoryConfig\types.ts"
    "src\features\properties\inventoryConfig\itemCatalog.ts"
    "src\features\properties\inventoryConfig\itemCatalogSocial.ts"
    "src\features\properties\inventoryConfig\itemCatalogBanosYcocina.ts"
    "src\features\properties\inventoryConfig\itemCatalogHabitaciones.ts"
    "src\features\properties\inventoryConfig\itemCatalogComercial.ts"
    "src\features\properties\inventoryConfig\propertyTypes.ts"
    "src\features\properties\inventoryConfig\propertyTypesResidencial.ts"
    "src\features\properties\inventoryConfig\propertyTypesComercial.ts"
    "src\features\properties\inventoryConfig\materialCatalog.ts"
    "src\features\properties\inventoryConfig\resolveAreas.ts"
)
$ok = $true
foreach ($f in $files) {
    if (Test-Path $f) { "  OK: $f" } else { "  MISSING: $f"; $ok = $false }
}
"AC-1: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-2: `inventoryConfig.ts` < 50 líneas

```powershell
$tv = "src\features\properties\inventoryConfig.ts"
$n = (Get-Content $tv -Encoding UTF8 | Measure-Object -Line).Lines
"AC-2: $(if ($n -lt 50) {'PASS ('+$n+')'} else {'FAIL ('+$n+')'})"
```

## AC-3: Cada archivo nuevo < 250 líneas

```powershell
$files = @(
    "src\features\properties\inventoryConfig\types.ts"
    "src\features\properties\inventoryConfig\itemCatalog.ts"
    "src\features\properties\inventoryConfig\itemCatalogSocial.ts"
    "src\features\properties\inventoryConfig\itemCatalogBanosYcocina.ts"
    "src\features\properties\inventoryConfig\itemCatalogHabitaciones.ts"
    "src\features\properties\inventoryConfig\itemCatalogComercial.ts"
    "src\features\properties\inventoryConfig\propertyTypes.ts"
    "src\features\properties\inventoryConfig\propertyTypesResidencial.ts"
    "src\features\properties\inventoryConfig\propertyTypesComercial.ts"
    "src\features\properties\inventoryConfig\materialCatalog.ts"
    "src\features\properties\inventoryConfig\resolveAreas.ts"
)
$ok = $true
foreach ($f in $files) {
    $n = (Get-Content $f -Encoding UTF8 | Measure-Object -Line).Lines
    "  $f`: $n"
    if ($n -ge 250) { $ok = $false }
}
"AC-3: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-4: tsc --noEmit exit 0

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

## AC-5: 80/80 tests pass

```powershell
npm test
```

## AC-6: 14 importadores externos sin cambios

```powershell
$ok = $true
$importers = @(
    "src\features\properties\actaPdf.ts"
    "src\features\properties\inventoryDiff.ts"
    "src\features\properties\InventoryDiffView.tsx"
    "src\features\properties\inventoryPdf.ts"
    "src\features\properties\inventoryTypes.ts"
    "src\features\properties\PropertiesView.tsx"
    "src\features\properties\components\AreaConfigPanel.tsx"
    "src\features\properties\components\StepBasic.tsx"
    "src\features\properties\components\StepInventory.tsx"
    "src\features\properties\components\areaEditor\AreaItemsChecklist.tsx"
    "src\features\properties\components\areaEditor\useAreaEditor.ts"
    "src\features\properties\components\inventory\InventoryConfigStage.tsx"
    "src\features\properties\components\inventory\InventoryEditingStage.tsx"
    "src\features\properties\components\inventory\hooks\useInventoryHydration.ts"
    "src\features\properties\components\inventory\hooks\useInventoryState.ts"
)
foreach ($f in $importers) {
    if (-not (Test-Path $f)) { "  WARN: $f no existe"; continue }
    $c = Get-Content $f -Raw
    if ($c -match "from ['\"][^'\"]*inventoryConfig['\"]") {
        "  OK: $f"
    } else {
        "  FAIL: $f no importa de inventoryConfig"; $ok = $false
    }
}
"AC-6: $(if ($ok) {'PASS'} else {'FAIL'})"
```
