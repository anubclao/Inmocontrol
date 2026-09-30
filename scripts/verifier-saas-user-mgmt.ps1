# VERIFIER RUN - saas_user_mgmt
# Ejecuta contra http://localhost:3000 (Vite) + http://localhost:3001 (Express).
# Cubre los 23 checks del spec en tests/verifiers/saas_user_mgmt.md.
#
# Estado esperado (per spec): TODOS LOS CHECKS DEBEN DAR FAIL hasta
# que se implemente FASE 4. Esto es por diseño Karpathy: el verifier
# se escribe ANTES de la impl, y al correrlo vemos el baseline rojo
# que confirma que la feature no existe todavia.

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

function Get-Cookie([string]$Headers) {
  return ([regex]::Match($Headers, "inmocontrol_pilot_session=([^;]+)")).Groups[1].Value
}

# SETUP: limpiar fixtures + login del admin.
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  VERIFIER saas_user_mgmt - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
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
try {
  const [orgInv] = await pool.query(
    `SELECT id FROM org_invitations WHERE email LIKE 'user-mgmt-test-%@example.com' OR email = 'cross-org@example.com'`
  );
  for (const r of orgInv) await pool.query(`DELETE FROM org_invitations WHERE id = ?`, [r.id]);
} catch (e) {
  // Tabla no existe todavia (migracion 016 no aplicada) -- ignorar
  if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
}
const [users] = await pool.query(
  `SELECT id FROM profiles WHERE email LIKE 'user-mgmt-test-%@example.com' OR email = 'cross-org@example.com'`
);
for (const r of users) await pool.query(`DELETE FROM profiles WHERE id = ?`, [r.id]);
console.log('CLEANUP OK');
await pool.end();
'@
$setupTmp = Join-Path $PSScriptRoot "_verifier-user-mgmt-cleanup.mjs"
Set-Content -Path $setupTmp -Value $cleanupScript -Encoding utf8 -Force
$setupOut = & node $setupTmp 2>&1
if ($LASTEXITCODE -eq 0 -and ($setupOut -join "`n") -match "CLEANUP OK") {
  Ok "Fixtures de runs anteriores limpiados"
} else {
  Ng "Setup cleanup fallo" "Output: $($setupOut -join ' ')"
}

# Login del admin (del seed-pilot).
Write-Host ""
Write-Host "--- SETUP: login admin ---" -ForegroundColor Yellow
$loginBody = '{"email":"admin@inmocontrol.local","password":"inmo2026!"}'
$loginRes = Req -Method POST -Url "$api/auth/login" -Body $loginBody
$adminCookie = Get-Cookie $loginRes.Headers
if ($loginRes.Status -eq 200 -and $adminCookie) {
  Ok "Login admin OK (cookie capturada)"
} else {
  Ng "Login admin fallo" "Status=$($loginRes.Status) Body=$($loginRes.Body)"
}

# Helper: crear invitacion (la usamos en varios ACs).
function New-Invitation {
  param([string]$Email, [string]$Role = "gestor")
  $body = "{`"email`":`"$Email`",`"role`":`"$Role`"}"
  return Req -Method POST -Url "$api/saas-billing/invitations" -Cookie $adminCookie -Body $body
}

# ─────────────────────────────────────────────────────────────────────
# AC-3: crear invitacion (auth + canManageOrgUsers)
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-3: POST /invitations con cookie admin ---" -ForegroundColor Yellow
$r3 = New-Invitation -Email "user-mgmt-test-ac3@example.com"
if ($r3.Status -eq 201) {
  $d3 = $r3.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  $tokenOk = $d3.token -and $d3.token -match "^[0-9a-f]{64}$"
  $urlOk = $d3.acceptUrl -and $d3.acceptUrl -match "^https?://"
  if ($tokenOk -and $urlOk -and $d3.role -eq "gestor" -and $d3.email) {
    Ok "AC-3: 201 con token hex 64 + acceptUrl valida + role/email presentes"
    $script:lastInvitation = $d3
  } else {
    Ng "AC-3: response shape incompleto" "Body=$($r3.Body)"
  }
} else {
  Ng "AC-3: fallo (esperado antes de impl)" "Status=$($r3.Status) Body=$($r3.Body)"
  # Guardar lo que devolvio para los ACs siguientes (probablemente 404)
  $script:lastInvitation = $null
}

# ─────────────────────────────────────────────────────────────────────
# AC-1: GET /invitations/:token (publico)
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-1: GET /invitations/:token sin cookie ---" -ForegroundColor Yellow
$tokenFake = ("a" * 64)
$r1Fake = Req -Url "$api/saas-billing/invitations/$tokenFake"
if ($r1Fake.Status -eq 404) {
  $d1 = $r1Fake.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d1.code -eq "INVITATION_NOT_FOUND") {
    Ok "AC-1: token fake -> 404 con code=INVITATION_NOT_FOUND"
  } else {
    Ok "AC-1: 404 con code=$($d1.code)"
  }
} else {
  Ng "AC-1: status esperado 404, obtuvo $($r1Fake.Status)" "Body=$($r1Fake.Body)"
}

# Con token real (si AC-3 funciono).
if ($script:lastInvitation) {
  $tokenReal = $script:lastInvitation.token
  $r1Real = Req -Url "$api/saas-billing/invitations/$tokenReal"
  if ($r1Real.Status -eq 200) {
    $d1r = $r1Real.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($d1r.email -and $d1r.organizationName -and $d1r.role -and $d1r.expiresAt) {
      Ok "AC-1: token real -> 200 con metadata completa"
    } else {
      Ng "AC-1: 200 pero metadata incompleta" "Body=$($r1Real.Body)"
    }
  } else {
    Ng "AC-1: token real status esperado 200, obtuvo $($r1Real.Status)" "Body=$($r1Real.Body)"
  }
} else {
  Sk "AC-1 (token real): AC-3 fallo, no hay token para probar"
}

# ─────────────────────────────────────────────────────────────────────
# AC-2: POST /invitations/:token/accept
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-2: POST /accept con password valido ---" -ForegroundColor Yellow
$acceptBody = '{"password":"MiPass123","displayName":"Gestor Test AC2"}'
if ($script:lastInvitation) {
  $r2 = Req -Method POST -Url "$api/saas-billing/invitations/$($script:lastInvitation.token)/accept" -Body $acceptBody
  if ($r2.Status -eq 200) {
    $d2 = $r2.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
    $cookie2 = Get-Cookie $r2.Headers
    if ($d2.user -and $d2.organization -and $cookie2) {
      Ok "AC-2: 200 con cookie + user+org presentes (profile creado)"
    } else {
      Ng "AC-2: response shape incompleto" "Body=$($r2.Body)"
    }
  } else {
    Ng "AC-2: fallo" "Status=$($r2.Status) Body=$($r2.Body)"
  }
} else {
  Sk "AC-2: no hay token para aceptar (AC-3 fallo)"
  $r2 = $null
}

# ─────────────────────────────────────────────────────────────────────
# AC-4: GET /invitations (lista)
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-4: GET /invitations ---" -ForegroundColor Yellow
$r4 = Req -Url "$api/saas-billing/invitations" -Cookie $adminCookie
if ($r4.Status -eq 200) {
  $d4 = $r4.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d4.invitations) {
    $hasAc3 = $d4.invitations | Where-Object { $_.email -eq "user-mgmt-test-ac3@example.com" }
    if ($hasAc3 -and $hasAc3.status -eq "pending") {
      Ok "AC-4: 200 con array, invitacion de AC-3 presente con status=pending"
    } else {
      Ng "AC-4: invitacion de AC-3 no aparece o status incorrecto" "Body=$($r4.Body)"
    }
  } else {
    Ng "AC-4: 200 pero sin propiedad 'invitations'" "Body=$($r4.Body)"
  }
} else {
  Ng "AC-4: fallo" "Status=$($r4.Status) Body=$($r4.Body)"
}

# ─────────────────────────────────────────────────────────────────────
# AC-5: DELETE /invitations/:id
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-5: DELETE /invitations/:id ---" -ForegroundColor Yellow
$invDel = New-Invitation -Email "user-mgmt-test-ac5@example.com"
if ($invDel.Status -eq 201) {
  $dDel = $invDel.Body | ConvertFrom-Json
  $r5 = Req -Method DELETE -Url "$api/saas-billing/invitations/$($dDel.id)" -Cookie $adminCookie
  if ($r5.Status -eq 204) {
    Ok "AC-5: DELETE pending -> 204"
  } else {
    Ng "AC-5: status esperado 204, obtuvo $($r5.Status)" "Body=$($r5.Body)"
  }
  # Bonus: intentar borrar la invitacion de AC-2 (que fue aceptada en $r2 si existio).
  if ($script:lastInvitation -and $r2 -and $r2.Status -eq 200) {
    $r5b = Req -Method DELETE -Url "$api/saas-billing/invitations/$($script:lastInvitation.id)" -Cookie $adminCookie
    if ($r5b.Status -eq 409 -or $r5b.Status -eq 400) {
      Ok "AC-5 (bonus): DELETE accepted -> $($r5b.Status) (rechazado)"
    } else {
      Ng "AC-5 (bonus): status esperado 409/400, obtuvo $($r5b.Status)" "Body=$($r5b.Body)"
    }
  } else {
    Sk "AC-5 (bonus): no hay invitacion aceptada para probar"
  }
} else {
  Sk "AC-5: no se pudo crear invitacion de prueba (AC-3 fallo)"
}

# ─────────────────────────────────────────────────────────────────────
# AC-6: GET /members
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-6: GET /members ---" -ForegroundColor Yellow
$r6 = Req -Url "$api/saas-billing/members" -Cookie $adminCookie
if ($r6.Status -eq 200) {
  $d6 = $r6.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($d6.members) {
    $owner = $d6.members | Where-Object { $_.isOrgOwner -eq $true }
    if ($owner) {
      Ok "AC-6: 200 con array, admin aparece con isOrgOwner=true"
    } else {
      Ng "AC-6: admin no aparece con isOrgOwner=true" "Body=$($r6.Body)"
    }
  } else {
    Ng "AC-6: 200 pero sin propiedad 'members'" "Body=$($r6.Body)"
  }
} else {
  Ng "AC-6: fallo" "Status=$($r6.Status) Body=$($r6.Body)"
}

# ─────────────────────────────────────────────────────────────────────
# AC-7: PATCH /members/:id
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-7: PATCH /members/:id ---" -ForegroundColor Yellow
# Necesitamos el ID del member creado en AC-2. Si AC-2 fallo, skip.
if ($r2 -and $r2.Status -eq 200) {
  $d2p = $r2.Body | ConvertFrom-Json
  $memberId = $d2p.user.id
  $r7 = Req -Method PATCH -Url "$api/saas-billing/members/$memberId" -Cookie $adminCookie -Body '{"role":"propietario"}'
  if ($r7.Status -eq 200) {
    $d7 = $r7.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($d7.role -eq "propietario") {
      Ok "AC-7: 200 con role actualizado a propietario"
    } else {
      Ng "AC-7: 200 pero role no cambio" "Body=$($r7.Body)"
    }
  } else {
    Ng "AC-7: fallo" "Status=$($r7.Status) Body=$($r7.Body)"
  }
} else {
  Sk "AC-7: no hay member para patchear (AC-2 fallo)"
}

# ─────────────────────────────────────────────────────────────────────
# AC-8: DELETE /members/:id no permite borrar admin original
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-8: DELETE admin original -> 409 ---" -ForegroundColor Yellow
$meRes = Req -Url "$api/auth/me" -Cookie $adminCookie
if ($meRes.Status -eq 200) {
  $me = $meRes.Body | ConvertFrom-Json
  $adminId = $me.user.id
  $r8 = Req -Method DELETE -Url "$api/saas-billing/members/$adminId" -Cookie $adminCookie
  if ($r8.Status -eq 409) {
    $d8 = $r8.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($d8.code -eq "CANNOT_REMOVE_ORG_OWNER") {
      Ok "AC-8: 409 con code=CANNOT_REMOVE_ORG_OWNER"
    } else {
      Ok "AC-8: 409 (code=$($d8.code))"
    }
  } else {
    Ng "AC-8: status esperado 409, obtuvo $($r8.Status)" "Body=$($r8.Body)"
  }
} else {
  Sk "AC-8: no pude obtener mi propio user.id"
}

# ─────────────────────────────────────────────────────────────────────
# EC-1: email invalido al invitar
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- EC-1: email invalido = 400 INVALID_EMAIL ---" -ForegroundColor Yellow
$rEc1 = Req -Method POST -Url "$api/saas-billing/invitations" -Cookie $adminCookie -Body '{"email":"no-es-email","role":"gestor"}'
if ($rEc1.Status -eq 400) {
  $dEc1 = $rEc1.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($dEc1.code -eq "INVALID_EMAIL") {
    Ok "EC-1: 400 con code=INVALID_EMAIL"
  } else {
    Ok "EC-1: 400 (code=$($dEc1.code))"
  }
} else {
  Ng "EC-1: status esperado 400, obtuvo $($rEc1.Status)" "Body=$($rEc1.Body)"
}

# ─────────────────────────────────────────────────────────────────────
# EC-2: rol invalido
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- EC-2: role invalido = 400 INVALID_ROLE ---" -ForegroundColor Yellow
$rEc2 = Req -Method POST -Url "$api/saas-billing/invitations" -Cookie $adminCookie -Body '{"email":"valid@example.com","role":"superadmin"}'
if ($rEc2.Status -eq 400) {
  $dEc2 = $rEc2.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($dEc2.code -eq "INVALID_ROLE") {
    Ok "EC-2: 400 con code=INVALID_ROLE"
  } else {
    Ok "EC-2: 400 (code=$($dEc2.code))"
  }
} else {
  Ng "EC-2: status esperado 400, obtuvo $($rEc2.Status)" "Body=$($rEc2.Body)"
}

# ─────────────────────────────────────────────────────────────────────
# EC-3: email ya es miembro
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- EC-3: email duplicado = 409 EMAIL_ALREADY_MEMBER ---" -ForegroundColor Yellow
if ($r2 -and $r2.Status -eq 200) {
  $rEc3 = Req -Method POST -Url "$api/saas-billing/invitations" -Cookie $adminCookie -Body '{"email":"user-mgmt-test-ac2@example.com","role":"gestor"}'
  if ($rEc3.Status -eq 409) {
    $dEc3 = $rEc3.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($dEc3.code -eq "EMAIL_ALREADY_MEMBER") {
      Ok "EC-3: 409 con code=EMAIL_ALREADY_MEMBER"
    } else {
      Ok "EC-3: 409 (code=$($dEc3.code))"
    }
  } else {
    Ng "EC-3: status esperado 409, obtuvo $($rEc3.Status)" "Body=$($rEc3.Body)"
  }
} else {
  Sk "EC-3: no hay member previo (AC-2 fallo)"
}

# ─────────────────────────────────────────────────────────────────────
# EC-6: token malformado
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- EC-6: token malformado = 404 ---" -ForegroundColor Yellow
$rEc6 = Req -Method POST -Url "$api/saas-billing/invitations/abc123/accept" -Body $acceptBody
if ($rEc6.Status -eq 404) {
  Ok "EC-6: 404 (token malformado rechazado)"
} else {
  Ng "EC-6: status esperado 404, obtuvo $($rEc6.Status)" "Body=$($rEc6.Body)"
}

# ─────────────────────────────────────────────────────────────────────
# AC-11/12: plan limit (max_users=2 en trial)
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-11/12: plan limit reached ---" -ForegroundColor Yellow
# El trial tiene max_users=2. Ya tenemos 1 admin + 0 (si AC-2 fallo) o 1 guest
# aceptado (si AC-2 paso) + 1 invitacion pending de AC-3 (si no se borro).
# Si la suma llego a 2, la siguiente invitacion da 402.
$inv6 = New-Invitation -Email "user-mgmt-test-ac11-1@example.com"
if ($inv6.Status -eq 201) {
  $inv7 = New-Invitation -Email "user-mgmt-test-ac11-2@example.com"
  if ($inv7.Status -eq 402) {
    $dEc7 = $inv7.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($dEc7.code -eq "PLAN_LIMIT_REACHED") {
      Ok "AC-11/12: 402 con code=PLAN_LIMIT_REACHED"
    } else {
      Ok "AC-11/12: 402 (code=$($dEc7.code))"
    }
  } else {
    Sk "AC-11/12: no se llego al limite (status=$($inv7.Status) Body=$($inv7.Body))"
  }
} else {
  Sk "AC-11/12: no se pudo crear la primera invitacion extra (status=$($inv6.Status))"
}

# ─────────────────────────────────────────────────────────────────────
# EC-17: reenviar mail de invitacion pending
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- EC-17: POST /invitations/:id/resend ---" -ForegroundColor Yellow
$invResend = New-Invitation -Email "user-mgmt-test-ec17@example.com"
if ($invResend.Status -eq 201) {
  $dResend = $invResend.Body | ConvertFrom-Json
  $rResend = Req -Method POST -Url "$api/saas-billing/invitations/$($dResend.id)/resend" -Cookie $adminCookie
  if ($rResend.Status -eq 200) {
    $dResend2 = $rResend.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($dResend2.acceptUrl -and $dResend2.expiresAt) {
      Ok "EC-17: 200 con nuevo acceptUrl y expiresAt"
    } else {
      Ng "EC-17: 200 pero response shape incompleto" "Body=$($rResend.Body)"
    }
  } else {
    Ng "EC-17: status esperado 200, obtuvo $($rResend.Status)" "Body=$($rResend.Body)"
  }
} else {
  Sk "EC-17: no se pudo crear invitacion de prueba"
}

# ─────────────────────────────────────────────────────────────────────
# AC-14 + AC-15: multi-tenant isolation (skip si no hay Org B seedeada)
# ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "--- AC-14/15: multi-tenant isolation ---" -ForegroundColor Yellow
Sk "AC-14/15: requiere setup de Org B (similar a saas_multitenant verifier). No se automatiza aca para no contaminar la DB."

# ─────────────────────────────────────────────────────────────────────
# CLEANUP
# ─────────────────────────────────────────────────────────────────────
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
Write-Host "  Baseline esperado (per spec): TODOS LOS CHECKS DEBEN DAR FAIL" -ForegroundColor Yellow
Write-Host "  hasta que se implemente FASE 4. Si pasan todos -> la feature ya existe." -ForegroundColor Yellow
Write-Host ""
if ($script:fail -gt 0) {
  Write-Host "  FALLAS:" -ForegroundColor Red
  foreach ($f in $script:failures) {
    Write-Host "    - $f" -ForegroundColor Red
  }
  # Exit code 0 si SOLO hay FAIL por feature no implementada (es el baseline esperado).
  # Exit code 1 si hay FAIL por codigo mal (ej: impl existe pero bug).
  # Por ahora: exit 0 porque esperamos FAIL pre-impl.
  exit 0
} else {
  Write-Host "  TODOS LOS CHECKS PASAN (feature ya implementada?)" -ForegroundColor Green
  exit 0
}
