# VERIFIER RUN - wizard_property (Fase Roja)
$base = "https://inmocontrol.tecnowebsupportia.com"
$tmp = Join-Path $env:TEMP "verifier-body.json"

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

function Test-CurlError {
  param(
    [string]$Label,
    [string]$BodyContent,
    [int]$ExpectedStatus
  )
  Write-Host "  $Label" -ForegroundColor Yellow
  Set-Content -Path $tmp -Value $BodyContent -Encoding utf8 -Force
  Write-Host "    body: $BodyContent"
  $output = curl.exe -X POST -H "Content-Type: application/json" -d "@$tmp" -s -w "\nSTATUS: %{http_code}\n" "$base/api/properties" 2>&1
  Write-Host "    $output"
  Write-Host ""
}

function Test-CurlSuccess {
  param(
    [string]$Label,
    [string]$BodyContent
  )
  Write-Host "  $Label" -ForegroundColor Yellow
  Set-Content -Path $tmp -Value $BodyContent -Encoding utf8 -Force
  Write-Host "    body: $BodyContent"
  $output = curl.exe -X POST -H "Content-Type: application/json" -d "@$tmp" -s -w "\nSTATUS: %{http_code}\n" "$base/api/properties" 2>&1
  Write-Host "    $output"
  Write-Host ""
}

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  VERIFIER RUN - wizard_property (Fase Roja)" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

Run-HealthCheck

Write-Host "--- AC-6: Errores del server devuelven JSON (nunca HTML) ---" -ForegroundColor Yellow
Test-CurlError -Label "Test 1: Body vacio {}" -BodyContent '{}' -ExpectedStatus 400
Test-CurlError -Label "Test 2: Body malformado 'xxx'" -BodyContent 'xxx' -ExpectedStatus 400
Test-CurlError -Label "Test 3: Body sin address {chip,folio,ownerName}" -BodyContent '{"chip":"X","folio":"Y","ownerName":"Z"}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- AC-1 (parcial): POST valido crea propiedad en MySQL ---" -ForegroundColor Yellow
$body1 = '{"address":"TEST-VERIFIER-' + (Get-Date -Format 'HHmmss') + '","chip":"AAATESTAC1","folio":"50NTESTAC1","ownerName":"Test Verifier","ownerIdNumber":"12345678","ownerPhone":"3001112233","ownerEmail":"verifier@test.com","propertyType":"apartamento","status":"Pendiente","owners":[{"id":"wizard-test-1","name":"Test Verifier","idNumber":"12345678","phone":"3001112233","email":"verifier@test.com","ownershipPct":null,"position":1}],"units":[]}'
Test-CurlSuccess -Label "Test 4: POST valido (debe ser 200 con propertyId)" -BodyContent $body1
Write-Host ""

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  RESUMEN CURL CHECKS:" -ForegroundColor Cyan
Write-Host "  - PRE-1: health check (ver arriba)" -ForegroundColor Cyan
Write-Host "  - AC-6: errores devuelven JSON, no HTML (ver arriba)" -ForegroundColor Cyan
Write-Host "  - AC-1 parcial: POST valido funciona (ver arriba)" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "  PROXIMOS CHECKS (requieren browser, tu usuario):" -ForegroundColor Cyan
Write-Host "  - AC-1 full: click Continuar en wizard, fila en MySQL" -ForegroundColor Cyan
Write-Host "  - AC-2: Guardar avance persiste" -ForegroundColor Cyan
Write-Host "  - AC-3: phone/email en legacy columns (SQL en phpMyAdmin)" -ForegroundColor Cyan
Write-Host "  - AC-4: timeout 15s cliente" -ForegroundColor Cyan
Write-Host "  - AC-5: Drive caido no bloquea wizard" -ForegroundColor Cyan
Write-Host "  - AC-7 a AC-14: visual checks + wizard flow completo" -ForegroundColor Cyan
Write-Host "  - EC-1, EC-13: edge cases" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
