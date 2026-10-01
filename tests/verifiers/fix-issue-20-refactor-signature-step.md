# Verifier — fix-issue-20 (SignatureStep refactor)

> E2E checklist binario. Cada AC debe pasar antes de marcar el issue como done.

## AC-1: 4 archivos nuevos existen

```powershell
$files = @(
    "src\features\properties\components\signatureStep\useSignatureStep.ts",
    "src\features\properties\components\signatureStep\SignerCard.tsx",
    "src\features\properties\components\signatureStep\LegalTextsCard.tsx",
    "src\features\properties\components\signatureStep\SharePdfModal.tsx"
)
$ok = $true
foreach ($f in $files) {
    if (Test-Path $f) { "  OK: $f" } else { "  MISSING: $f"; $ok = $false }
}
"AC-1: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-2: `SignatureStep.tsx` < 250 líneas

```powershell
$tv = "src\features\properties\components\SignatureStep.tsx"
$n = (Get-Content $tv -Encoding UTF8 | Measure-Object -Line).Lines
"AC-2: $(if ($n -lt 250) {'PASS ('+$n+')'} else {'FAIL ('+$n+')'})"
```

## AC-3: Cada archivo nuevo < 250 líneas

```powershell
$files = @(
    "src\features\properties\components\signatureStep\useSignatureStep.ts",
    "src\features\properties\components\signatureStep\SignerCard.tsx",
    "src\features\properties\components\signatureStep\LegalTextsCard.tsx",
    "src\features\properties\components\signatureStep\SharePdfModal.tsx"
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
    "useSignatureStep" = "src\features\properties\components\signatureStep\useSignatureStep.ts"
    "SignerCard" = "src\features\properties\components\signatureStep\SignerCard.tsx"
    "LegalTextsCard" = "src\features\properties\components\signatureStep\LegalTextsCard.tsx"
    "SharePdfModal" = "src\features\properties\components\signatureStep\SharePdfModal.tsx"
}
foreach ($n in $checks.Keys) {
    $c = Get-Content $checks[$n] -Raw
    if ($c -match "export (function|const) $n\b") { "  OK: $n" } else { "  FAIL: $n no exportado"; $ok = $false }
}
"AC-4: $(if ($ok) {'PASS'} else {'FAIL'})"
```

## AC-5: `SignatureStep.tsx` importa los nuevos archivos y NO los redeclara

```powershell
$tv = "src\features\properties\components\SignatureStep.tsx"
$content = Get-Content $tv -Raw
$ok = $true
$tabs = @("SignerCard", "LegalTextsCard", "SharePdfModal", "useSignatureStep")
foreach ($n in $tabs) {
    $il = Select-String -Path $tv -Pattern "from .*signatureStep/$n"
    if ($il) { "  OK: import $n" } else { "  FAIL: no import $n"; $ok = $false }
}
foreach ($n in $tabs) {
    $r = ([regex]::Matches($content, "(^|\n)(export )?function $n\b|(^|\n)(export )?const $n\b")).Count
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
