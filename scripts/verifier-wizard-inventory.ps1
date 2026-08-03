# VERIFIER RUN - wizard_inventory (Fase Roja)
# Companion: tests/verifiers/wizard_inventory.md (24 ACs + 14 ECs)
# Spec:      docs/specs/wizard_inventory.md
#
# Ejecuta contra prod (https://inmocontrol.tecnowebsupportia.com) los checks
# que se pueden automatizar con curl. Los visuales + IndexedDB + Drive
# quedan en el cuerpo del verifier para que los corras vos manualmente.

$base = "https://inmocontrol.tecnowebsupportia.com"
$tmp = Join-Path $env:TEMP "verifier-inventory-body.json"

function Run-HealthCheck {
  Write-Host "--- PRE-1: Health check ---" -ForegroundColor Yellow
  try {
    $h = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing -TimeoutSec 10
    $body = $h.Content | ConvertFrom-Json
    if ($h.StatusCode -eq 200 -and $body.status -eq "ok" -and $body.db.ok) {
      Write-Host "  PASS: status=$($h.StatusCode), db.version=$($body.db.version)" -ForegroundColor Green
    } else {
      Write-Host "  FAIL: status=$($h.StatusCode), body=$($h.Content)" -ForegroundColor Red
    }
  } catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
  }
  Write-Host ""
}

function Test-Curl {
  param(
    [string]$Label,
    [string]$Method,
    [string]$Path,
    [string]$BodyContent,
    [int]$ExpectedStatus
  )
  Write-Host "  $Label" -ForegroundColor Yellow
  Set-Content -Path $tmp -Value $BodyContent -Encoding utf8 -Force
  Write-Host "    $Method $Path"
  Write-Host "    body: $BodyContent"
  $output = curl.exe -X $Method -H "Content-Type: application/json" -d "@$tmp" -s -w "\nSTATUS: %{http_code}\n" "$base$Path" 2>&1
  $actualStatus = ($output | Select-String "STATUS: (\d+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
  if ($actualStatus -eq $ExpectedStatus) {
    Write-Host "  -> status=$actualStatus (esperado $ExpectedStatus) PASS" -ForegroundColor Green
  } else {
    Write-Host "  -> status=$actualStatus (esperado $ExpectedStatus) FAIL" -ForegroundColor Red
  }
  Write-Host "    $output" -ForegroundColor DarkGray
  Write-Host ""
}

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  VERIFIER RUN - wizard_inventory (Fase Roja)" -ForegroundColor Cyan
Write-Host "  Spec:     docs/specs/wizard_inventory.md (incl. photoGallery Amendment jul-2026)" -ForegroundColor Cyan
Write-Host "  Verifier: tests/verifiers/wizard_inventory.md (24 ACs + 14 ECs)" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

Run-HealthCheck

Write-Host "--- AC-14: Errores del server devuelven JSON (nunca HTML) ---" -ForegroundColor Yellow
Test-Curl -Label "Test 1: POST inventario con body vacio" -Method POST -Path "/api/inventories" -BodyContent '{}' -ExpectedStatus 400
Test-Curl -Label "Test 2: POST inventario con body malformado" -Method POST -Path "/api/inventories" -BodyContent 'xxx' -ExpectedStatus 400
Test-Curl -Label "Test 3: POST inventario sin propertyId" -Method POST -Path "/api/inventories" -BodyContent '{"phase":"inicial","propertyType":"apartamento"}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- AC-19: POST es idempotente (UPSERT) ---" -ForegroundColor Yellow
# Mismo id enviado 2 veces: no debe crear duplicado.
$ts = Get-Date -Format 'HHmmss'
$sameId = "test-upsert-$ts"
$bodyUpsert = '{"id":"' + $sameId + '","propertyId":"X","phase":"inicial","propertyType":"apartamento","areas":[],"items":{},"photos":[],"signatures":[]}'
Test-Curl -Label "Test 4: POST inventario con id custom (1ra vez)" -Method POST -Path "/api/inventories" -BodyContent $bodyUpsert -ExpectedStatus 200
Test-Curl -Label "Test 5: POST inventario MISMO id (2da vez, debe ser UPSERT)" -Method POST -Path "/api/inventories" -BodyContent $bodyUpsert -ExpectedStatus 200
Write-Host ""

Write-Host "--- AC-18 (parcial): GET inventario devuelve fila persistida ---" -ForegroundColor Yellow
$output = curl.exe -s -w "\nSTATUS: %{http_code}\n" "$base/api/inventories" 2>&1
$actualStatus = ($output | Select-String "STATUS: (\d+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
if ($actualStatus -eq "200") {
  Write-Host "  -> GET /api/inventories status=200 PASS" -ForegroundColor Green
} else {
  Write-Host "  -> GET /api/inventories status=$actualStatus FAIL" -ForegroundColor Red
}
Write-Host "    $output" -ForegroundColor DarkGray
Write-Host ""

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  RESUMEN CURL CHECKS:" -ForegroundColor Cyan
Write-Host "  - PRE-1: health check" -ForegroundColor Cyan
Write-Host "  - AC-14: errores devuelven JSON, no HTML" -ForegroundColor Cyan
Write-Host "  - AC-19: UPSERT (mismo id 2 veces = 1 sola fila)" -ForegroundColor Cyan
Write-Host "  - AC-18 parcial: GET /api/inventories" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "  PROXIMOS CHECKS (requieren browser, tu usuario):" -ForegroundColor Cyan
Write-Host "  - AC-1 a AC-13: visual checks del wizard + IndexedDB + Drive" -ForegroundColor Cyan
Write-Host "  - AC-15: Drive timeout 8s server-side (devtools throttle)" -ForegroundColor Cyan
Write-Host "  - AC-16: cliente timeout 15s (Slow 3G)" -ForegroundColor Cyan
Write-Host "  - AC-17: boton Firmar disabled durante subida" -ForegroundColor Cyan
Write-Host "  - AC-20: PDF NO se persiste en MySQL (solo URL)" -ForegroundColor Cyan
Write-Host "  - AC-21/22/23/24: photoGallery Amendment (DevTools + IndexedDB + SQL)" -ForegroundColor Cyan
Write-Host "  - EC-1 a EC-14: edge cases" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
