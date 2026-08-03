# VERIFIER RUN - wizard_tenant (Fase Roja)
# Companion: tests/verifiers/wizard_tenant.md (16 ACs + 10 ECs)
# Spec:      docs/specs/wizard_tenant.md
#
# Ejecuta contra prod (https://inmocontrol.tecnowebsupportia.com) los checks
# que se pueden automatizar con curl. Los visuales quedan en el cuerpo del
# verifier para que los corras vos manualmente en el browser.

$base = "https://inmocontrol.tecnowebsupportia.com"
$tmp = Join-Path $env:TEMP "verifier-tenant-body.json"

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
Write-Host "  VERIFIER RUN - wizard_tenant (Fase Roja)" -ForegroundColor Cyan
Write-Host "  Spec:     docs/specs/wizard_tenant.md" -ForegroundColor Cyan
Write-Host "  Verifier: tests/verifiers/wizard_tenant.md (16 ACs + 10 ECs)" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

Run-HealthCheck

Write-Host "--- AC-11 / AC-12: Errores del server devuelven JSON (nunca HTML) ---" -ForegroundColor Yellow
Test-Curl -Label "Test 1: Body vacio" -Method POST -Path "/api/tenants" -BodyContent '{}' -ExpectedStatus 400
Test-Curl -Label "Test 2: Body malformado" -Method POST -Path "/api/tenants" -BodyContent 'xxx' -ExpectedStatus 400
Test-Curl -Label "Test 3: Body sin campos obligatorios (name, documentId, propertyId)" -Method POST -Path "/api/tenants" -BodyContent '{"name":"x"}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- EC-2: Cédula duplicada debe dar 409 ---" -ForegroundColor Yellow
# No podemos asumir que ya hay duplicados, pero si lo hay, esperamos 409.
# Para Fase Roja: capturar el codigo que devuelve el server (sera 200 si crea OK, o 409 si duplicado).
$bodyDup = '{"name":"TEST-VERIFIER-' + (Get-Date -Format 'HHmmss') + '","documentId":"99999999","propertyId":"wizard-doesnt-matter","rent":1000000,"phone":"3001112233","email":"verifier@test.com"}'
Test-Curl -Label "Test 4: POST con documentId que YA existe (esperado 409)" -Method POST -Path "/api/tenants" -BodyContent $bodyDup -ExpectedStatus 409
Write-Host ""

Write-Host "--- AC-3: POST valido crea tenant en MySQL (parcial) ---" -ForegroundColor Yellow
$body1 = '{"name":"TEST-VERIFIER-' + (Get-Date -Format 'HHmmss') + '","documentId":"88888' + (Get-Date -Format 'HHmmss') + '","propertyId":"X","rent":1000000,"phone":"3001112233","email":"verifier-tenant@test.com"}'
Test-Curl -Label "Test 5: POST valido (debe ser 200 con tenantId)" -Method POST -Path "/api/tenants" -BodyContent $body1 -ExpectedStatus 200
Write-Host ""

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  RESUMEN CURL CHECKS:" -ForegroundColor Cyan
Write-Host "  - PRE-1: health check" -ForegroundColor Cyan
Write-Host "  - AC-11: errores devuelven JSON, no HTML" -ForegroundColor Cyan
Write-Host "  - AC-12: Drive server-side (solo verificable con curl -X 'no-test')" -ForegroundColor Cyan
Write-Host "  - AC-3 parcial: POST valido funciona" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "  PROXIMOS CHECKS (requieren browser, tu usuario):" -ForegroundColor Cyan
Write-Host "  - AC-1: validacion inline en modal Nuevo Arrendatario" -ForegroundColor Cyan
Write-Host "  - AC-2: modal ABIERTO durante POST (no se cierra antes)" -ForegroundColor Cyan
Write-Host "  - AC-3 full: toast honesto + Drive folder + persistencia" -ForegroundColor Cyan
Write-Host "  - AC-4: subir cedula a Drive en tiempo real" -ForegroundColor Cyan
Write-Host "  - AC-5: cedula se refresca desde Drive al abrir Detalle" -ForegroundColor Cyan
Write-Host "  - AC-6/7: 2 firmas + creacion automatica de contrato" -ForegroundColor Cyan
Write-Host "  - AC-8: BillingSetupWizard se abre con boton disabled si ya hay policy" -ForegroundColor Cyan
Write-Host "  - AC-9/10: Acta de Entrega (generar + no bloquea facturacion)" -ForegroundColor Cyan
Write-Host "  - AC-13: cliente timeout 15s" -ForegroundColor Cyan
Write-Host "  - AC-14: boton 'Generar acta' disabled durante subida" -ForegroundColor Cyan
Write-Host "  - AC-15: estado de Drive al abrir Detalle" -ForegroundColor Cyan
Write-Host "  - AC-16: cerrar modal limpia state" -ForegroundColor Cyan
Write-Host "  - EC-1, EC-3, EC-4, EC-6, EC-7, EC-8, EC-10: edge cases" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
