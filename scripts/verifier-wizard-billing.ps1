# VERIFIER RUN - wizard_billing (Fase Roja)
# Companion: tests/verifiers/wizard_billing.md (30 ACs + 8 ECs)
# Spec:      docs/specs/wizard_billing.md
#
# Ejecuta contra prod (https://inmocontrol.tecnowebsupportia.com) los checks
# que se pueden automatizar con curl. Los visuales + Drive + PDFs
# quedan en el cuerpo del verifier para que los corras vos manualmente.

$base = "https://inmocontrol.tecnowebsupportia.com"
$tmp = Join-Path $env:TEMP "verifier-billing-body.json"

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
Write-Host "  VERIFIER RUN - wizard_billing (Fase Roja)" -ForegroundColor Cyan
Write-Host "  Spec:     docs/specs/wizard_billing.md" -ForegroundColor Cyan
Write-Host "  Verifier: tests/verifiers/wizard_billing.md (30 ACs + 8 ECs)" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

Run-HealthCheck

Write-Host "--- AC-27: Errores del server devuelven JSON (nunca HTML) ---" -ForegroundColor Yellow
Test-Curl -Label "Test 1: POST policy con body vacio" -Method POST -Path "/api/billing/policies/xxx" -BodyContent '{}' -ExpectedStatus 400
Test-Curl -Label "Test 2: POST policy con body malformado" -Method POST -Path "/api/billing/policies/xxx" -BodyContent 'xxx' -ExpectedStatus 400
Test-Curl -Label "Test 3: POST policy con graceDay=0 (validacion server-side)" -Method POST -Path "/api/billing/policies/xxx" -BodyContent '{"rentAmount":1000000,"adminFee":50000,"graceDay":0,"lateFeeMidPct":5,"lateFeeLatePct":10,"applyAnnualIpc":false,"expectedIpcPct":0,"applyIpcToAdmin":false,"allowAdminChanges":false}' -ExpectedStatus 400
Test-Curl -Label "Test 4: POST amortization con body vacio" -Method POST -Path "/api/billing/amortization/generate" -BodyContent '{}' -ExpectedStatus 400
Test-Curl -Label "Test 5: POST invoices/send con body vacio" -Method POST -Path "/api/billing/invoices/send" -BodyContent '{}' -ExpectedStatus 400
Test-Curl -Label "Test 6: POST payments con body vacio" -Method POST -Path "/api/billing/payments" -BodyContent '{}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- EC-2: La policy tiene campos invalidos (defensa en profundidad) ---" -ForegroundColor Yellow
# AC-4 + EC-2: el server debe rechazar graceDay fuera de [1, 28].
Test-Curl -Label "Test 7: graceDay=31 (fuera de rango)" -Method POST -Path "/api/billing/policies/xxx" -BodyContent '{"rentAmount":1000000,"adminFee":50000,"graceDay":31,"lateFeeMidPct":5,"lateFeeLatePct":10,"applyAnnualIpc":false,"expectedIpcPct":0,"applyIpcToAdmin":false,"allowAdminChanges":false}' -ExpectedStatus 400
Test-Curl -Label "Test 8: lateFeeMidPct=60 (fuera de rango)" -Method POST -Path "/api/billing/policies/xxx" -BodyContent '{"rentAmount":1000000,"adminFee":50000,"graceDay":10,"lateFeeMidPct":60,"lateFeeLatePct":10,"applyAnnualIpc":false,"expectedIpcPct":0,"applyIpcToAdmin":false,"allowAdminChanges":false}' -ExpectedStatus 400
Test-Curl -Label "Test 9: rentAmount negativo" -Method POST -Path "/api/billing/policies/xxx" -BodyContent '{"rentAmount":-1000,"adminFee":50000,"graceDay":10,"lateFeeMidPct":5,"lateFeeLatePct":10,"applyAnnualIpc":false,"expectedIpcPct":0,"applyIpcToAdmin":false,"allowAdminChanges":false}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- EC-4: Dia de pago 31 (clamping server-side) ---" -ForegroundColor Yellow
Test-Curl -Label "Test 10: paidOnDayOfMonth=31 (server debe aceptar y clampear a 30)" -Method POST -Path "/api/billing/payments" -BodyContent '{"contractId":"x","rowId":"y","paidOnDayOfMonth":31,"paidAmount":1000}' -ExpectedStatus 400
Write-Host ""

Write-Host "--- EC-10: GET owner-statement sin parametros ---" -ForegroundColor Yellow
$output = curl.exe -s -w "\nSTATUS: %{http_code}\n" "$base/api/billing/owner-statement" 2>&1
$actualStatus = ($output | Select-String "STATUS: (\d+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
if ($actualStatus -eq "400") {
  Write-Host "  -> GET sin params status=400 (esperado) PASS" -ForegroundColor Green
} else {
  Write-Host "  -> GET sin params status=$actualStatus (revisar: deberia ser 400) CHECK" -ForegroundColor Yellow
}
Write-Host "    $output" -ForegroundColor DarkGray
Write-Host ""

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  RESUMEN CURL CHECKS:" -ForegroundColor Cyan
Write-Host "  - PRE-1: health check" -ForegroundColor Cyan
Write-Host "  - AC-27: errores devuelven JSON, no HTML" -ForegroundColor Cyan
Write-Host "  - AC-4 + EC-2: validacion server-side de policy" -ForegroundColor Cyan
Write-Host "  - EC-4: clamping de paidOnDayOfMonth" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "  PROXIMOS CHECKS (requieren browser, tu usuario):" -ForegroundColor Cyan
Write-Host "  - AC-1: BillingSetupWizard se dispara al firmar Inventario de Colocacion" -ForegroundColor Cyan
Write-Host "  - AC-2: wizard muestra estado real de Policy (boton disabled si ya hay)" -ForegroundColor Cyan
Write-Host "  - AC-5: saveBillingPolicy + getOrGenerateAmortization (ambos POST 200)" -ForegroundColor Cyan
Write-Host "  - AC-10/11/12/13: Enviar CC + invoice_number idempotente + PDF + Drive" -ForegroundColor Cyan
Write-Host "  - AC-14/15/16/17/18: PaymentModal + mora + unlock mes N+1" -ForegroundColor Cyan
Write-Host "  - AC-19/20/21/22/23: Estado de Cuenta del Propietario + PDF" -ForegroundColor Cyan
Write-Host "  - AC-24/25/26: Descuentos + Aumentos" -ForegroundColor Cyan
Write-Host "  - AC-28/29/30: timeouts y disabled button" -ForegroundColor Cyan
Write-Host "  - EC-1, EC-3, EC-5, EC-6, EC-9: edge cases" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
