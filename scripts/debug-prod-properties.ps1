#!/usr/bin/env pwsh
# Debug: reproduce el 500 del wizard contra producción
# Simula el body que el frontend manda en el "Continuar a Documentación"

$url = "https://inmocontrol.tecnowebsupportia.com/api/properties"
$body = @{
  localId = "wizard-debug-test"
  address = "TEST CALLE 123"
  chip = "AAATEST0000"
  folio = "50NTEST0000"
  ownerName = "Test Owner"
  ownerIdNumber = $null
  propertyType = "apartamento"
  status = "Pendiente"
  owners = @(
    @{
      id = "wizard-owner-test-1"
      name = "Test Owner"
      idNumber = $null
      phone = $null
      email = $null
      ownershipPct = $null
      position = 1
    }
  )
  units = @()
} | ConvertTo-Json -Depth 10

Write-Host "=== POST $url ==="
Write-Host "Body:"
Write-Host $body
Write-Host ""
Write-Host "=== Response ==="

try {
  $response = Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -ErrorAction Stop
  Write-Host "Status: $($response.StatusCode)"
  Write-Host "Content-Type: $($response.Headers['Content-Type'])"
  Write-Host "Body:"
  Write-Host $response.Content
} catch {
  $ex = $_.Exception
  Write-Host "ERROR CAPTURADO"
  Write-Host "Tipo: $($ex.GetType().FullName)"
  Write-Host "Mensaje: $($ex.Message)"
  if ($ex.Response) {
    Write-Host "Status: $($ex.Response.StatusCode)"
    Write-Host "StatusDescription: $($ex.Response.StatusDescription)"
    Write-Host "Headers: $($ex.Response.Headers | Out-String)"
    $reader = [System.IO.StreamReader]::new($ex.Response.GetResponseStream())
    $responseBody = $reader.ReadToEnd()
    Write-Host "Body:"
    Write-Host $responseBody
    $reader.Close()
  }
}
