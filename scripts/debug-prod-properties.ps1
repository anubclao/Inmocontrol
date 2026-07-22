#!/usr/bin/env pwsh
# Debug: reproduce el 500 del wizard contra producción con timeout corto

# ── 0. Health check primero ──
Write-Host "=== 0. Health check (GET /api/health) ===" -ForegroundColor Cyan
try {
  $t0 = Get-Date
  $r = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/health" -Method Get -UseBasicParsing -TimeoutSec 15
  $dt = "{0:N1}" -f ((Get-Date) - $t0).TotalSeconds
  Write-Host "OK status=$($r.StatusCode) time=${dt}s"
  Write-Host $r.Content
} catch {
  Write-Host "FALLO health: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# ── 1. POST /api/properties con timeout estricto ──
Write-Host "=== 1. POST /api/properties (timeout 30s) ===" -ForegroundColor Cyan
$url = "https://inmocontrol.tecnowebsupportia.com/api/properties"
$body = @{
  localId       = "wizard-debug-$((Get-Date).ToString('HHmmss'))"
  address       = "TEST CALLE 123"
  chip          = "AAATEST0000"
  folio         = "50NTEST0000"
  ownerName     = "Test Owner"
  ownerIdNumber = $null
  propertyType  = "apartamento"
  status        = "Pendiente"
  owners = @(
    @{
      id           = "wizard-owner-test-1"
      name         = "Test Owner"
      idNumber     = $null
      phone        = $null
      email        = $null
      ownershipPct = $null
      position     = 1
    }
  )
  units = @()
} | ConvertTo-Json -Depth 10

Write-Host "Body:"
Write-Host $body
Write-Host ""

try {
  $t0 = Get-Date
  $response = Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
  $dt = "{0:N1}" -f ((Get-Date) - $t0).TotalSeconds
  Write-Host "Status: $($response.StatusCode) en ${dt}s" -ForegroundColor Green
  Write-Host "Content-Type: $($response.Headers['Content-Type'])"
  Write-Host "Body:"
  Write-Host $response.Content
} catch {
  $ex = $_.Exception
  Write-Host "EXCEPCION" -ForegroundColor Red
  Write-Host "Tipo: $($ex.GetType().FullName)"
  Write-Host "Mensaje: $($ex.Message)"
  if ($ex.Response) {
    $resp = $ex.Response
    Write-Host "Status: $($resp.StatusCode) ($($resp.StatusDescription))"
    $stream = $resp.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $bodyText = $reader.ReadToEnd()
      $reader.Close()
      Write-Host "Body:"
      Write-Host $bodyText
    }
  }
}
