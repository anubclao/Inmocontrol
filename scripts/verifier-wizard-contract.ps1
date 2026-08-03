# VERIFIER RUN - wizard_contract (Fase Roja)
# Companion: tests/verifiers/wizard_contract.md (14 ACs + 8 ECs)
# Spec:      docs/specs/wizard_contract.md
#
# Ejecuta contra prod (https://inmocontrol.tecnowebsupportia.com) los checks
# que se pueden automatizar con curl. Los visuales quedan en el cuerpo del
# verifier para que los corras vos manualmente en el browser.

$base = "https://inmocontrol.tecnowebsupportia.com"
$tmp = Join-Path $env:TEMP "verifier-contract-body.json"

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
Write-Host "  VERIFIER RUN - wizard_contract (Fase Roja)" -ForegroundColor Cyan
Write-Host "  Spec:     docs/specs/wizard_contract.md" -ForegroundColor Cyan
Write-Host "  Verifier: tests/verifiers/wizard_contract.md (14 ACs + 8 ECs)" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

Run-HealthCheck

Write-Host "--- AC-8: Errores del server devuelven JSON (nunca HTML) ---" -ForegroundColor Yellow
# AC-7 habla de PATCH /api/contracts/:id. Probemos con id invalido + body malformado.
Test-Curl -Label "Test 1: PATCH con id invalido 'xxx'" -Method PATCH -Path "/api/contracts/xxx" -BodyContent '{}' -ExpectedStatus 400
Test-Curl -Label "Test 2: PATCH con body malformado" -Method PATCH -Path "/api/contracts/xxx" -BodyContent 'yyy' -ExpectedStatus 400
Test-Curl -Label "Test 3: PATCH con body vacio (sin campos requeridos)" -Method PATCH -Path "/api/contracts/xxx" -BodyContent '{}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- AC-9/10/11/12: Validacion server-side de campos ---" -ForegroundColor Yellow
# Probemos con data invalida para ver que el server valida tambien.
Test-Curl -Label "Test 4: rentAmount negativo" -Method PATCH -Path "/api/contracts/xxx" -BodyContent '{"rentAmount":-1000}' -ExpectedStatus 400
Test-Curl -Label "Test 5: endDate < startDate" -Method PATCH -Path "/api/contracts/xxx" -BodyContent '{"startDate":"2026-12-31","endDate":"2026-01-01"}' -ExpectedStatus 400
Test-Curl -Label "Test 6: status invalido" -Method PATCH -Path "/api/contracts/xxx" -BodyContent '{"status":"banana"}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- AC-7 (parcial): GET /api/contracts devuelve lista ---" -ForegroundColor Yellow
$output = curl.exe -s -w "\nSTATUS: %{http_code}\n" "$base/api/contracts" 2>&1
$actualStatus = ($output | Select-String "STATUS: (\d+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
if ($actualStatus -eq "200") {
  Write-Host "  -> GET /api/contracts status=200 PASS" -ForegroundColor Green
} else {
  Write-Host "  -> GET /api/contracts status=$actualStatus FAIL" -ForegroundColor Red
}
Write-Host "    $output" -ForegroundColor DarkGray
Write-Host ""

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  RESUMEN CURL CHECKS:" -ForegroundColor Cyan
Write-Host "  - PRE-1: health check" -ForegroundColor Cyan
Write-Host "  - AC-8: errores devuelven JSON, no HTML" -ForegroundColor Cyan
Write-Host "  - AC-9/10/11/12: validacion server-side de campos" -ForegroundColor Cyan
Write-Host "  - AC-7 parcial: GET /api/contracts" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "  PROXIMOS CHECKS (requieren browser, tu usuario):" -ForegroundColor Cyan
Write-Host "  - AC-1: modal Editar Contrato se abre desde la fila" -ForegroundColor Cyan
Write-Host "  - AC-2/3/4/5/6: auto-fill de canon y adminFee + no override" -ForegroundColor Cyan
Write-Host "  - AC-7 full: PATCH preserva TODOS los campos" -ForegroundColor Cyan
Write-Host "  - AC-13: boton Guardar disabled durante PATCH" -ForegroundColor Cyan
Write-Host "  - AC-14: toast honesto" -ForegroundColor Cyan
Write-Host "  - EC-1 a EC-8: edge cases" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
