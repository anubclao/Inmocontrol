# Verifier — fix-issue-19 (AreaEditor refactor)

> E2E checklist binario. Cada AC debe pasar antes de marcar el issue como done.

## AC-1: 6 archivos nuevos existen

```powershell
$files = @(
    "src\features\properties\components\areaEditor\useAreaEditor.ts",
    "src\features\properties\components\areaEditor\AreaItemsChecklist.tsx",
    "src\features\properties\components\areaEditor\AreaPhotosSection.tsx",
    "src\features\properties\components\areaEditor\RemoveItemModal.tsx",
    "src\features\properties\components\areaEditor\MediaViewers.tsx",
    "src\features\properties\components\areaEditor\RemovedItemRow.tsx"
)
$ok = $true
foreach ($f in $files) {
    if (Test-Path $f) { "  OK: $f" } else { "  MISSING: $f"; $ok = $false }
}
"AC-1: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-2: `AreaEditor.tsx` < 250 líneas

```powershell
$tv = "src\features\properties\components\AreaEditor.tsx"
$n = (Get-Content $tv -Encoding UTF8 | Measure-Object -Line).Lines
"AC-2: $(if ($n -lt 250) {'PASS ('+$n+')'} else {'FAIL ('+$n+')'})"
```

## AC-3: Cada archivo nuevo < 250 líneas

```powershell
$files = @(
    "src\features\properties\components\areaEditor\useAreaEditor.ts",
    "src\features\properties\components\areaEditor\AreaItemsChecklist.tsx",
    "src\features\properties\components\areaEditor\AreaPhotosSection.tsx",
    "src\features\properties\components\areaEditor\RemoveItemModal.tsx",
    "src\features\properties\components\areaEditor\MediaViewers.tsx",
    "src\features\properties\components\areaEditor\RemovedItemRow.tsx"
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

````powershell
$ok =useAreaEditor" = "src\features\properties\components\areaEditor\useAreaEditor.ts"
    "AreaItemsChecklist" = "src\features\properties\components\areaEditor\AreaItemsChecklist.tsx"
    "AreaPhotosSection" = "src\features\properties\components\areaEditor\AreaPhotosSection.tsx"
    "RemoveItemModal" = "src\features\properties\components\areaEditor\RemoveItemModal.tsx"
    "MediaViewers" = "src\features\properties\components\areaEditor\MediaViewers.tsx"
    "RemovedItemRow" = "src\features\properties\components\areaEditor\RemovedItemRowtosSection.tsx"
    "RemoveItemModal" = "src\features\properties\components\areaEditor\RemoveItemModal.tsx"
    "MediaViewers" = "src\features\properties\components\areaEditor\MediaViewers.tsx"
}
foreach ($n in $checks.Keys) {
    $c = Get-Content $checks[$n] -Raw
    if ($c -match "export function $n\b") { "  OK: $n" } else { "  FAIL: $n no exportado"; $ok = $false }
}
"AC-4: $(if ($ok) {'PASS'} else {'FAIL'})"
```nuevos archivos y NO los redeclara

```powershell
$tv = "src\features\properties\components\AreaEditor.tsx"
$content = Get-Content $tv -Raw
$ok = $true
$tabs = @("AreaItemsChecklist", "AreaPhotosSection", "RemoveItemModal", "MediaViewers")
foreach ($n in $tabs) {
    $il = Select-String -Path $tv -Pattern "from .*areaEditor/$n"
    if ($il) { "  OK: import $n" } else { "  FAIL: no import $n"; $ok = $false }
}
$il = Select-String -Path $tv -Pattern "from .*areaEditor/useAreaEditor"
if ($il) { "  OK: import useAreaEditor" } else { "  FAIL: no import useAreaEditor"; $ok = $false     $il = Select-String -Path $tv -Pattern "from .*areaEditor/$n"
    if ($il) { "  OK: import $n" } else { "  FAIL: no import $n"; $ok = $false }
}
foreach ($n in $tabs) {
    $r = ([regex]::Matches($content, "(^|\n)(export )?function $n\b")).Count
    if ($r -eq 0) { "  OK: $n no redeclarado" } else { "  FAIL: $n redeclarado"; $ok = $false }
}
"AC-5: $(if ($ok) {'PASS'} else {'FAIL'})"
````

## AC-6.1: tsc --noEmit exit 0

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npx tsc --noEmit
```

## AC-6.2: tests 80/80

```powershell
npm test
```
