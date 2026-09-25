# Verifier: Rate limit en `/api/auth/login` — E2E Checklist

> **Karpathy Verifier**. Se corre DESPUÉS de spec aprobado. Cada AC
> tiene 1+ pasos verificables. **NO modificar para hacer pasar**.
>
> **Estado esperado pre-fix**: el endpoint NO tiene rate limit.
> **Estado esperado post-fix**: AC-1 a AC-10 pasan.

## Pre-requisitos

- Deploy productivo: `https://inmocontrol.tecnowebsupportia.com`.
- phpMyAdmin accesible.
- PowerShell 7+.
- curl o `Invoke-WebRequest`.

## Convención de resultado

- ✅ PASS / ❌ FAIL / 🔴 EXPECTED FAIL (pre-fix) / ⚠️ SKIP.

---

## Setup: limpiar tabla para tests aislados

```powershell
# Limpiar contadores previos del verifier (manual, en phpMyAdmin):
# DELETE FROM login_attempts WHERE ip LIKE '127.%';
```

## AC-1: Tabla `login_attempts` existe

```powershell
$res = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/health" -UseBasicParsing
# Si la API responde 200, verificar manualmente en phpMyAdmin que existe la tabla login_attempts
```

**Resultado esperado**: la tabla existe con UNIQUE en `(ip, email, window_start)`.

**Status pre-fix:** 🔴 EXPECTED FAIL / **post-fix:** ✅ PASS

---

## AC-2: Rate limit por IP+email (5 intentos / 15min → 429)

```powershell
$body = '{"email":"test-ratelimit@inmocontrol.co","password":"wrong-password-1"}'
$headers = @{ "Content-Type" = "application/json" }

# Intentar 6 veces
for ($i = 1; $i -le 6; $i++) {
  $res = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/auth/login" `
    -Method POST -Headers $headers -Body $body -UseBasicParsing
  if ($i -le 5) { Write-Host "Intento $i: $($res.StatusCode)" }
  if ($i -eq 6) {
    Write-Host "Intento 6 (debe ser 429): $($res.StatusCode)"
    if ($res.StatusCode -eq 429) {
      Write-Host "✓ AC-2 PASS" -ForegroundColor Green
    } else {
      Write-Host "✗ AC-2 FAIL: got $($res.StatusCode)" -ForegroundColor Red
    }
  }
}
```

**Status pre-fix:** 🔴 EXPECTED FAIL / **post-fix:** ✅ PASS

---

## AC-3: Rate limit por IP (20 intentos / 15min, mix de emails → 429)

```powershell
$emails = @("test1@x.co","test2@x.co","test3@x.co","test4@x.co","test5@x.co")
# Probar 21 logins con emails distintos
# (mismo IP, distinto email → rate limit por IP debe dispararse en el intento 21)
```

**Status pre-fix:** 🔴 EXPECTED FAIL / **post-fix:** ✅ PASS

---

## AC-4: Login exitoso resetea contadores

```powershell
# Caso manual (requiere creds válidas):
# 1. Hacer 4 logins fallidos con email real del tester
# 2. Hacer 1 login OK
# 3. Inmediatamente hacer 1 login fallido → debe pasar (no estar bloqueado)
```

**Status post-fix:** ✅ PASS (los contadores se soft-clear)

---

## AC-5: Mensaje 429 NO leakea

```powershell
$body = '{"email":"victim@real-user.co","password":"wrong"}'
# Saturar el rate limit
# El 429 debe tener el mismo mensaje "Demasiados intentos" sin distinguir
# si el email existe o no.
```

**Resultado esperado**: `{"error":"Demasiados intentos. Reintentá en unos minutos.","code":"RATE_LIMITED","retryAfter":900}` (o similar, genérico).

**Status post-fix:** ✅ PASS

---

## AC-6: Headers estándar HTTP

```powershell
$res = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/auth/login" `
  -Method POST -Body (parámetro con rate limit)
$res.Headers["Retry-After"]
$res.Headers["X-RateLimit-Limit"]
```

**Status post-fix:** ✅ PASS (los 4 headers deben estar)

---

## AC-7: Migración idempotente

- La migración `014_login_attempts.sql` se aplica con `node scripts/apply-014-migration.mjs` sin errores, incluso corriendo 2 veces.

**Status post-fix:** ✅ PASS

---

## AC-8: Cleanup periódico

```powershell
# Insertar fila sintética con attempted_at vieja
# Esperar al siguiente ciclo de cleanup
# Verificar que se borró/purgó
```

**Status post-fix:** ✅ PASS

---

## AC-9: Bypass en NODE_ENV=test

```powershell
$env:NODE_ENV = 'test'
# Hacer 100 logins fallidos → todos devuelven 401 (NO 429)
$env:NODE_ENV = 'production'
# Hacer 6 logins fallidos → el 6º devuelve 429
```

**Status post-fix:** ✅ PASS

---

## AC-10: Tests automatizados pasan

```powershell
npm test
```

Resultado esperado: los 6 tests del archivo `tests/rateLimit.test.ts` pasan:
1. 5 intentos fallidos OK + 6º → 429
2. Login OK + 1 fail → no se bloquea
3. Reset tras login OK
4. 20 attempts desde misma IP → 429
5. Email normalizado (mayúsculas) cuenta igual
6. NODE_ENV=test bypasea

**Status post-fix:** ✅ PASS

---

## Resumen

| AC | Status pre | Status post |
|---|---|---|
| AC-1 | 🔴 FAIL | ✅ PASS |
| AC-2 | 🔴 FAIL | ✅ PASS |
| AC-3 | 🔴 FAIL | ✅ PASS |
| AC-4 | N/A | ✅ PASS |
| AC-5 | N/A | ✅ PASS |
| AC-6 | N/A | ✅ PASS |
| AC-7 | N/A | ✅ PASS |
| AC-8 | N/A | ✅ PASS |
| AC-9 | N/A | ✅ PASS |
| AC-10 | 🔴 FAIL | ✅ PASS |