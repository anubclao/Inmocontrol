# VERIFIER RUN - saas_signup
# Ejecuta contra http://localhost:3000 (Vite) + http://localhost:3001 (Express).
# Cubre los 24 checks del spec en tests/verifiers/saas_signup.md.

$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$api  = "$base/api"

# Counters
$script:pass = 0
$script:fail = 0
$script:skip = 0
$script:failures = @()

function Ok {
  param([string]$Msg)
  $script:pass++
  Write-Host "  [PASS] $Msg" -ForegroundColor Green
}
function Ng {
  param([string]$Msg, [string]$Detail = "")
  $script:fail++
  $script:failures += "$Msg -- $Detail"
  Write-Host "  [FAIL] $Msg" -ForegroundColor Red
  if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkRed }
}
function Sk {
  param([string]$Msg)
  $script:skip++
  Write-Host "  [SKIP] $Msg" -ForegroundColor Yellow
}

function Req {
  # Wrapper alrededor de curl.exe.
  # IMPORTANTE: usa --data-binary @file (no -d "string") porque PowerShell
  # interpreta el `!` dentro de comillas dobles y rompe el JSON.
  param(
    [string]$Method = "GET",
    [string]$Url,
    [string]$Cookie = "",
    [string]$Body = ""
  )
  $tmpBody = $null
  $args = @("-s", "-i", "-X", $Method, "-w", "`n__STATUS__%{http_code}__END__", "--max-time", "10")
  if ($Cookie) { $args += @("-H", "Cookie: inmocontrol_pilot_session=$Cookie") }
  if ($Body) {
    $tmpBody = Join-Path $PSScriptRoot "_verifier-body.json"
    Set-Content -Path $tmpBody -Value $Body -Encoding utf8 -Force
    $args += @("-H", "Content-Type: application/json", "--data-binary", "@$tmpBody")
  }
  $args += $Url
  $raw = & curl.exe @args 2>&1
  $statusMatch = [regex]::Match(($raw -join "`n"), "__STATUS__(\d+)__END__")
  $status = if ($statusMatch.Success) { [int]$statusMatch.Groups[1].Value } else { 0 }
  $cleanRaw = ($raw -join "`n") -replace "__STATUS__\d+__END__", ""
  $headers = ($cleanRaw -split "`r?`n`r?`n")[0]
  $body = ($cleanRaw -split "`r?`n`r?`n") | Select-Object -Skip 1
  $bodyText = ($body -join "`n").Trim()
  return @{ Status = $status; Body = $bodyText; Headers = $headers }
}

# SETUP: limpiar emails de prueba previos.
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  VERIFIER saas_signup - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "--- SETUP: limpiar fixtures de runs anteriores ---" -ForegroundColor Yellow
$cleanupScript = @'
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import mysql from 'mysql2/promise';
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
});
// Borrar en orden inverso a las FKs.
const [subs] = await pool.query(`SELECT s.id FROM saas_subscriptions s JOIN organizations o ON s.organization_id = o.id WHERE o.created_by LIKE 'signup-test-%@example.com'`);
for (const r of subs) await pool.query(`DELETE FROM saas_subscriptions WHERE id = ?`, [r.id]);
const [orgs] = await pool.query(`SELECT id FROM organizations WHERE created_by LIKE 'signup-test-%@example.com'`);
for (const r of orgs) await pool.query(`DELETE FROM organizations WHERE id = ?`, [r.id]);
const [users] = await pool.query(`SELECT id FROM profiles WHERE email LIKE 'signup-test-%@example.com'`);
for (const r of users) await pool.query(`DELETE FROM profiles WHERE id = ?`, [r.id]);
console.log('CLEANUP OK');
await pool.end();
'@
$setupTmp = Join-Path $PSScriptRoot "_verifier-signup-cleanup.mjs"
Set-Content -Path $setupTmp -Value $cleanupScript -Encoding utf8 -Force
$setupOut = & node $setupTmp 2>&1
if ($LASTEXITCODE -eq 0 -and ($setupOut -join "`n") -match "CLEANUP OK") {
  Ok "Fixtures de runs anteriores limpiados"
} else {
  Ng "Setup cleanup fallo" "Output: $($setupOut -join ' ')"
}

# Helper: extrae la cookie de un response.
function Get-Cookie([string]$Headers) {
  return ([regex]::Match($Headers, "inmocontrol_pilot_session=([^;]+)")).Groups[1].Value
}

# AC-1: signup valido crea org + profile + subscription.
Write-Host ""
Write-Host "--- AC-1: POST /signup con body valido ---" -ForegroundColor Yellow
$body1 = '{"email":"signup-test-1@example.com","password":"MiPass123","organizationName":"Inmobiliaria Signup Test 1"}'
$r1 = Req -Method POST -Url "$api/saas-billing/signup" -Body $body1
$cookie1 = Get-Cookie $r1.Headers
if ($r1.Status -eq 200 -and $cookie1) {
  $d1 = $r1.Body | ConvertFrom-Json
  $hasAll = $d1.user -and $d1.organization -and $d1.subscription
  $isAdmin = $d1.user.role -eq "admin"
  $isTrialing = $d1.subscription.status -eq "trialing"
  if ($hasAll -and $isAdmin -and $isTrialing) {
    Ok "AC-1: 200 OK, cookie seteada, user+org+subscription presentes, role=admin, status=trialing"
  } else {
    Ng "AC-1: response shape incompleto" "hasAll=$hasAll isAdmin=$isAdmin isTrialing=$isTrialing Body=$($r1.Body)"
  }
} else {
  Ng "AC-1: fallo" "Status=$($r1.Status) Body=$($r1.Body)"
}

# AC-3: top-level try/catch con body malformado.
Write-Host ""
Write-Host "--- AC-3: body malformado devuelve JSON 400 ---" -ForegroundColor Yellow
$r3 = Req -Method POST -Url "$api/saas-billing/signup" -Body "xxx"
if ($r3.Status -eq 400) {
  $d3 = $r3.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d3.code) {
    Ok "AC-3: 400 JSON con code=$($d3.code)"
  } else {
    Ok "AC-3: 400 (response es JSON)"
  }
} else {
  Ng "AC-3: status esperado 400, obtuvo $($r3.Status)" "Body=$($r3.Body)"
}

# AC-4: campos requeridos faltan.
Write-Host ""
Write-Host "--- AC-4: body vacio = 400 MISSING_REQUIRED_FIELDS ---" -ForegroundColor Yellow
$r4 = Req -Method POST -Url "$api/saas-billing/signup" -Body '{}'
if ($r4.Status -eq 400) {
  $d4 = $r4.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d4.code -eq "MISSING_REQUIRED_FIELDS") {
    Ok "AC-4: 400 con code=MISSING_REQUIRED_FIELDS"
  } else {
    Ng "AC-4: 400 pero code incorrecto" "code=$($d4.code) Body=$($r4.Body)"
  }
} else {
  Ng "AC-4: status esperado 400, obtuvo $($r4.Status)" "Body=$($r4.Body)"
}

# AC-5: email invalido.
Write-Host ""
Write-Host "--- AC-5: email invalido = 400 INVALID_EMAIL ---" -ForegroundColor Yellow
$r5 = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"no-es-un-email","password":"MiPass123","organizationName":"Inmobiliaria Test 5"}'
if ($r5.Status -eq 400) {
  $d5 = $r5.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d5.code -eq "INVALID_EMAIL") {
    Ok "AC-5: 400 con code=INVALID_EMAIL"
  } else {
    Ng "AC-5: 400 pero code incorrecto" "code=$($d5.code) Body=$($r5.Body)"
  }
} else {
  Ng "AC-5: status esperado 400, obtuvo $($r5.Status)" "Body=$($r5.Body)"
}

# AC-6: password debil.
Write-Host ""
Write-Host "--- AC-6: password corto = 400 WEAK_PASSWORD ---" -ForegroundColor Yellow
$r6 = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"test6@example.com","password":"corto","organizationName":"Inmobiliaria Test 6"}'
if ($r6.Status -eq 400) {
  $d6 = $r6.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d6.code -eq "WEAK_PASSWORD") {
    Ok "AC-6: 400 con code=WEAK_PASSWORD"
  } else {
    Ng "AC-6: 400 pero code incorrecto" "code=$($d6.code) Body=$($r6.Body)"
  }
} else {
  Ng "AC-6: status esperado 400, obtuvo $($r6.Status)" "Body=$($r6.Body)"
}

# AC-7: orgName < 3 chars.
Write-Host ""
Write-Host "--- AC-7: organizationName corto = 400 INVALID_ORG_NAME ---" -ForegroundColor Yellow
$r7 = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"test7@example.com","password":"MiPass123","organizationName":"AB"}'
if ($r7.Status -eq 400) {
  $d7 = $r7.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d7.code -eq "INVALID_ORG_NAME") {
    Ok "AC-7: 400 con code=INVALID_ORG_NAME"
  } else {
    Ng "AC-7: 400 pero code incorrecto" "code=$($d7.code) Body=$($r7.Body)"
  }
} else {
  Ng "AC-7: status esperado 400, obtuvo $($r7.Status)" "Body=$($r7.Body)"
}

# AC-8: email duplicado.
Write-Host ""
Write-Host "--- AC-8: email duplicado = 409 EMAIL_TAKEN ---" -ForegroundColor Yellow
$r8 = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"signup-test-1@example.com","password":"OtroPass456","organizationName":"Otra Inmobiliaria"}'
if ($r8.Status -eq 409) {
  $d8 = $r8.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d8.code -eq "EMAIL_TAKEN") {
    Ok "AC-8: 409 con code=EMAIL_TAKEN"
  } else {
    Ng "AC-8: 409 pero code incorrecto" "code=$($d8.code) Body=$($r8.Body)"
  }
} else {
  Ng "AC-8: status esperado 409, obtuvo $($r8.Status)" "Body=$($r8.Body)"
}

# AC-9, AC-10, AC-11: org/profile/subscription existen en DB con los valores correctos.
Write-Host ""
Write-Host "--- AC-9/10/11: DB tiene org + profile + subscription ---" -ForegroundColor Yellow
$dbCheckScript = @'
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import mysql from 'mysql2/promise';
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
});
const [orgs] = await pool.query(`SELECT id, name, created_by FROM organizations WHERE created_by = ?`, ['signup-test-1@example.com']);
const [users] = await pool.query(`SELECT id, organization_id, email, role, display_name FROM profiles WHERE email = ?`, ['signup-test-1@example.com']);
const [subs] = await pool.query(`SELECT s.id, s.organization_id, s.status, s.current_period_start, s.current_period_end, p.slug FROM saas_subscriptions s JOIN saas_plans p ON s.plan_id = p.id JOIN organizations o ON s.organization_id = o.id WHERE o.created_by = ?`, ['signup-test-1@example.com']);
console.log(JSON.stringify({ orgs, users, subs }));
await pool.end();
'@
$dbCheckTmp = Join-Path $PSScriptRoot "_verifier-signup-dbcheck.mjs"
Set-Content -Path $dbCheckTmp -Value $dbCheckScript -Encoding utf8 -Force
$dbOut = & node $dbCheckTmp 2>&1
$dbJson = $dbOut | Select-String -Pattern '^\{' | Select-Object -First 1
if ($dbJson) {
  $dbData = $dbJson.Line | ConvertFrom-Json
  if ($dbData.orgs.Count -eq 1 -and $dbData.orgs[0].id -match '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-') {
    Ok "AC-9: org creada con UUID v4"
  } else {
    Ng "AC-9: org no encontrada o id no es UUID" "orgs=$($dbData.orgs)"
  }
  if ($dbData.users.Count -eq 1 -and $dbData.users[0].role -eq "admin" -and $dbData.users[0].organization_id) {
    Ok "AC-10: profile con role=admin y organization_id"
  } else {
    Ng "AC-10: profile no encontrado o datos incorrectos" "users=$($dbData.users)"
  }
  if ($dbData.subs.Count -eq 1 -and $dbData.subs[0].status -eq "trialing" -and $dbData.subs[0].slug -eq "trial") {
    $days = ([datetime]$dbData.subs[0].current_period_end - [datetime]$dbData.subs[0].current_period_start).Days
    if ($days -ge 13 -and $days -le 15) {
      Ok "AC-11: subscription trialing con plan trial y periodo de $days dias"
    } else {
      Ng "AC-11: periodo incorrecto" "days=$days"
    }
  } else {
    Ng "AC-11: subscription no encontrada o datos incorrectos" "subs=$($dbData.subs)"
  }
} else {
  Ng "AC-9/10/11: DB check fallo" "Output: $($dbOut -join ' ')"
}

# AC-12: la cookie httpOnly funciona con /api/auth/me.
Write-Host ""
Write-Host "--- AC-12: cookie httpOnly funciona con /api/auth/me ---" -ForegroundColor Yellow
if ($cookie1) {
  $r12 = Req -Url "$api/auth/me" -Cookie $cookie1
  if ($r12.Status -eq 200) {
    $d12 = $r12.Body | ConvertFrom-Json
    if ($d12.user.email -eq "signup-test-1@example.com" -and $d12.user.role -eq "admin") {
      Ok "AC-12: /api/auth/me devuelve el user del signup con cookie httpOnly"
    } else {
      Ng "AC-12: /me response incorrecto" "Body=$($r12.Body)"
    }
  } else {
    Ng "AC-12: /me no devolvio 200" "Status=$($r12.Status) Body=$($r12.Body)"
  }
} else {
  Sk "AC-12: no hay cookie para probar (AC-1 fallo)"
}

# AC-15: el plan trial se auto-seedea (idempotente).
Write-Host ""
Write-Host "--- AC-15: plan trial auto-seed es idempotente ---" -ForegroundColor Yellow
$r15a = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"signup-test-15a@example.com","password":"MiPass123","organizationName":"Inmobiliaria Test 15a"}'
$r15b = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"signup-test-15b@example.com","password":"MiPass123","organizationName":"Inmobiliaria Test 15b"}'
if ($r15a.Status -eq 200 -and $r15b.Status -eq 200) {
  $planA = ($r15a.Body | ConvertFrom-Json).subscription.planId
  $planB = ($r15b.Body | ConvertFrom-Json).subscription.planId
  if ($planA -eq $planB -and $planA) {
    Ok "AC-15: ambos signups reciben el mismo planId ($planA) - auto-seed idempotente"
  } else {
    Ng "AC-15: planIds diferentes" "A=$planA B=$planB"
  }
} else {
  Ng "AC-15: signups fallaron" "A=$($r15a.Status) B=$($r15b.Status)"
}

# EC-1: email con mayusculas se normaliza.
Write-Host ""
Write-Host "--- EC-1: email con mayusculas se normaliza ---" -ForegroundColor Yellow
$rEc1 = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"SIGNUP-TEST-1@EXAMPLE.COM","password":"OtroPass456","organizationName":"Otra Mas"}'
if ($rEc1.Status -eq 409) {
  $dEc1 = $rEc1.Body | ConvertFrom-Json
  if ($dEc1.code -eq "EMAIL_TAKEN") {
    Ok "EC-1: 409 EMAIL_TAKEN (el email se trato como duplicado, lowercase aplicado)"
  } else {
    Ng "EC-1: 409 pero code incorrecto" "Body=$($rEc1.Body)"
  }
} else {
  Ng "EC-1: status esperado 409, obtuvo $($rEc1.Status)" "Body=$($rEc1.Body)"
}

# EC-10: si ya hay sesion activa, rechazar.
Write-Host ""
Write-Host "--- EC-10: sesion activa rechaza nuevo signup ---" -ForegroundColor Yellow
if ($cookie1) {
  $rEc10 = Req -Method POST -Url "$api/saas-billing/signup" -Cookie $cookie1 -Body '{"email":"otro@example.com","password":"MiPass123","organizationName":"Otra Mas"}'
  if ($rEc10.Status -eq 409) {
    $dEc10 = $rEc10.Body | ConvertFrom-Json
    if ($dEc10.code -eq "ALREADY_AUTHENTICATED") {
      Ok "EC-10: 409 con code=ALREADY_AUTHENTICATED"
    } else {
      Ok "EC-10: 409 (code=$($dEc10.code))"
    }
  } else {
    Ng "EC-10: status esperado 409, obtuvo $($rEc10.Status)" "Body=$($rEc10.Body)"
  }
} else {
  Sk "EC-10: no hay cookie para probar"
}

# EC-11: doble click no crea 2 orgs (mismo email, segundo = 409).
Write-Host ""
Write-Host "--- EC-11: doble click = 1 OK + 1 conflictivo ---" -ForegroundColor Yellow
$bodyEc11 = '{"email":"signup-test-ec11@example.com","password":"MiPass123","organizationName":"Inmobiliaria EC11"}'
$rEc11a = Req -Method POST -Url "$api/saas-billing/signup" -Body $bodyEc11
$rEc11b = Req -Method POST -Url "$api/saas-billing/signup" -Body $bodyEc11
if ($rEc11a.Status -eq 200 -and $rEc11b.Status -eq 409) {
  Ok "EC-11: primer 200, segundo 409 (no se duplico)"
} else {
  Ng "EC-11: resultados inesperados" "A=$($rEc11a.Status) B=$($rEc11b.Status)"
}

# EC-8: orgName con solo espacios = 400 INVALID_ORG_NAME (despues de trim queda vacio).
Write-Host ""
Write-Host "--- EC-8: orgName solo espacios = 400 ---" -ForegroundColor Yellow
$rEc8 = Req -Method POST -Url "$api/saas-billing/signup" -Body '{"email":"test-ec8@example.com","password":"MiPass123","organizationName":"   "}'
if ($rEc8.Status -eq 400) {
  $dEc8 = $rEc8.Body | ConvertFrom-Json
  if ($dEc8.code -eq "INVALID_ORG_NAME") {
    Ok "EC-8: 400 con code=INVALID_ORG_NAME (trim aplicado)"
  } else {
    Ng "EC-8: 400 pero code incorrecto" "Body=$($rEc8.Body)"
  }
} else {
  Ng "EC-8: status esperado 400, obtuvo $($rEc8.Status)" "Body=$($rEc8.Body)"
}

# CLEANUP: borrar todo lo creado.
Write-Host ""
Write-Host "--- CLEANUP: borrar fixtures ---" -ForegroundColor Yellow
$cleanupOut2 = & node $setupTmp 2>&1
if ($cleanupOut2 -match "CLEANUP OK") {
  Ok "Cleanup OK"
} else {
  Write-Host "  [WARN] Cleanup manual requerido: $($cleanupOut2 -join ' ')" -ForegroundColor Yellow
}

# RESUMEN
Write-Host ""
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  [PASS]: $script:pass" -ForegroundColor Green
Write-Host "  [FAIL]: $script:fail" -ForegroundColor Red
Write-Host "  [SKIP]: $script:skip" -ForegroundColor Yellow
Write-Host "  Total: $($script:pass + $script:fail + $script:skip)" -ForegroundColor Cyan
Write-Host ""
if ($script:fail -gt 0) {
  Write-Host "  FALLAS:" -ForegroundColor Red
  foreach ($f in $script:failures) {
    Write-Host "    - $f" -ForegroundColor Red
  }
  exit 1
} else {
  Write-Host "  TODOS LOS CHECKS PASAN" -ForegroundColor Green
  exit 0
}
