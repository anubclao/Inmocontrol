# Inicia Express + Vite detached. Imprime PIDs.
$ErrorActionPreference = 'Stop'
$root = 'D:\desarrollos\Inmocontrol'

# Express (tsx) - ventana oculta, logs en server.log
$express = Start-Process -FilePath 'C:\Program Files\nodejs\npx.cmd' `
  -ArgumentList 'tsx','server.ts' `
  -WorkingDirectory $root `
  -RedirectStandardOutput "$root\server.log" `
  -RedirectStandardError "$root\server.err" `
  -WindowStyle Hidden -PassThru

# Vite (npm run dev)
$vite = Start-Process -FilePath 'C:\Program Files\nodejs\npx.cmd' `
  -ArgumentList 'vite' `
  -WorkingDirectory $root `
  -RedirectStandardOutput "$root\vite.log" `
  -RedirectStandardError "$root\vite.err" `
  -WindowStyle Hidden -PassThru

Write-Output "Express PID: $($express.Id)"
Write-Output "Vite PID:    $($vite.Id)"
Write-Output "Wait 5s for boot..."
Start-Sleep -Seconds 5
$port3001 = (Test-NetConnection -ComputerName localhost -Port 3001 -WarningAction SilentlyContinue) -as [bool]
$port3000 = (Test-NetConnection -ComputerName localhost -Port 3000 -WarningAction SilentlyContinue) -as [bool]
Write-Output "3001 (Express): $port3001"
Write-Output "3000 (Vite):    $port3000"
