# Verifier: Validación de permisos por endpoint — E2E Checklist

> **Metodología Karpathy (Agent Skill)**: este verifier se escribe DESPUÉS
> de que `docs/specs/fix-issue-permissions-by-endpoint.md` esté aprobado.
> Cada Acceptance Criterion del spec tiene 1+ pasos verificables acá.
> **NO modificar este archivo para hacer que los checks pasen** (eso es
> trampa). Si un check falla, el código está mal.
>
> **Estado esperado antes del fix**: este verifier **DEBE FALLAR** en
> AC-1, AC-2, AC-4, AC-5, AC-7 porque el backend hoy NO valida permisos
> por endpoint — solo `requireAuth`. Cuando se implemente el fix, debe
> pasar al 100%.

## Cómo ejecutar

### Pre-requisitos

- Deploy productivo: `https://inmocontrol.tecnowebsupportia.com`.
- phpMyAdmin accesible.
- PowerShell 7+ en Windows.
- Browser con DevTools (F12 → Network).

### Convención de resultado

Cada check devuelve:
- ✅ **PASS** — el comportamiento es exactamente el del spec.
- ❌ **FAIL** — el comportamiento difiere (reportar el output real).
- ⚠️ **SKIP** — no se puede verificar ahora (motivo al lado).
- 🔴 **EXPECTED FAIL** — el verifier espera que FALLE (estado pre-fix). Cuando pase, el fix está OK.

### Preparación: 3 usuarios de prueba

Para correr este verifier, necesitamos 3 cuentas: una con cada rol. En
el piloto single-tenant, podemos crear usuarios adicionales en la tabla
`profiles` con password bcrypt. Si NO existen, este verifier los crea
como pre-requisito (ver script de setup).

```powershell
# Crear 3 usuarios de prueba (admin, propietario, inquilino)
# Requiere acceso a phpMyAdmin o un script Node con bcrypt.

# Script sugerido: scripts/setup-test-users.mjs
# Genera hashes bcrypt de "TestPassword123!" para cada rol.
# Inserta en profiles con organization_id del ensureDefaultOrg.
```

Una vez creados, login con cada uno y guardar la cookie:

```powershell
# Login admin (cookie guardada en $adminCookie)
$login = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"email":"test-admin@inmocontrol.co","password":"TestPassword123!"}' `
  -SessionVariable $adminSession -UseBasicParsing
$adminCookie = ($adminSession.Cookies | Where-Object Name -eq 'inmocontrol_pilot_session').Value

# Repetir para propietario e inquilino.
```

---

## Acceptance Criteria

### AC-1: Middleware `requireRole(action)` rechaza con 403 si el rol no tiene el permiso

**Pasos:**
1. Login como **inquilino** → guardar cookie.
2. Enviar `POST /api/properties` con un body válido:
   ```json
   {"address":"TEST EC-1","chip":"AAA12345","folio":"TEST-1","ownerName":"Test","propertyType":"apartamento"}
   ```
3. Capturar el status code.

**Resultado esperado (post-fix):**
- Status: `403 Forbidden`.
- Body: `{ "error": "No tenés permiso para esta acción", "code": "FORBIDDEN", "action": "canAddProperty", "userRole": "inquilino" }`.

**Resultado real:**
- _[Llenar después de ejecutar]_

**Status:** 🔴 EXPECTED FAIL (pre-fix) / ⏳ Pending / ✅ PASS

---

### AC-2: Middleware `requireRole(action)` deja pasar si el rol tiene el permiso

**Pasos:**
1. Login como **admin** → guardar cookie.
2. Enviar `POST /api/properties` con body válido (dirección única, ej: `TEST AC-2-{timestamp}`).
3. Capturar el status code.

**Resultado esperado:**
- Status: `201 Created` (o `200 OK`).
- Body: `{ "success": true, "propertyId": "...", "driveFolderId":... }`.

**Resultado real:**
- _[Llenar después de ejecutar]_

**Status:** ✅ PASS (admin ya pasa con requireAuth solo)

---

### AC-3: Matriz `ROLE_PERMISSIONS` vive en el server (mismas reglas que el frontend)

**Pasos:**
1. Leer `server/lib/permissions.ts` (debe existir post-fix).
2. Leer `src/features/auth/permissions.ts` (existe hoy).
3. Ejecutar `node --test tests/permissions-matrix.test.ts` (test que compara ambas).

**Resultado esperado:**
- El test pasa: las 2 matrices tienen los mismos valores booleanos para los 3 roles.
- Si difieren → test falla con diff claro.

**Resultado real:**
- _[Llenar después de ejecutar]_

**Status:** 🔴 EXPECTED FAIL (pre-fix — `server/lib/permissions.ts` no existe) / ⏳ Pending / ✅ PASS

---

### AC-4: Cada endpoint privado usa `requireAuth + requireRole(action)`

**Pasos:**
1. `grep -n "router\.\(get\|post\|patch\|delete\)" server/routes/*.ts` → listar todos los endpoints.
2. Para cada endpoint mutador (POST/PATCH/DELETE), verificar que tenga `requireRole(...)` aplicado.

**Mapeo esperado (mínimo):**

| Endpoint | Acción esperada |
|---|---|
| `POST /api/properties` | `canAddProperty` |
| `PATCH /api/properties/:id` | `canEditProperty` |
| `DELETE /api/properties/:id` | `canDeleteProperty` |
| `POST /api/tenants` | `canAddTenant` |
| `PATCH /api/tenants/:id` | `canEditTenant` |
| `DELETE /api/tenants/:id` | `canDeleteTenant` |
| `POST /api/entities/contracts` | `canAddContract` |
| `PATCH /api/entities/contracts/:id` | `canEditContract` |
| `DELETE /api/entities/contracts/:id` | `canDeleteContract` |
| `POST /api/inventories` | `canAddInventory` |
| `POST /api/billing/invoices/send` | `canSendInvoice` |
| `POST /api/billing/payments` | `canRegisterPayment` |
| `POST /api/billing/owner-payouts` | `canRegisterOwnerPayout` |
| `POST /api/drive/upload-pdf` | `canManageDrive` |
| `POST /api/notifications/whatsapp` | `canManageNotifications` |
| `POST /api/saas-billing/plans` | `canManageSaasBilling` |

**Resultado esperado:**
- Cada endpoint mutador tiene su acción correspondiente.
- Ningún endpoint mutador sin acción asignada.

**Resultado real:**
- _[Llenar después de ejecutar — el listado de endpoints sin acción]_

**Status:** 🔴 EXPECTED FAIL (pre-fix — ningún endpoint tiene `requireRole`)

---

### AC-5: Inquilino recibe 403 en TODOS los POST/PATCH/DELETE

**Pasos:**
1. Login como **inquilino**.
2. Probar cada uno de los siguientes endpoints mutadores:
   - `POST /api/properties` → esperado 403.
   - `PATCH /api/properties/1` → esperado 403.
   - `DELETE /api/properties/1` → esperado 403.
   - `POST /api/tenants` → esperado 403.
   - `POST /api/entities/contracts` → esperado 403.
   - `POST /api/billing/invoices/send` → esperado 403.
   - `POST /api/billing/payments` → esperado 403.
   - `POST /api/drive/upload-pdf` → esperado 403.

**Resultado esperado:**
- TODOS devuelven 403 con `{ code: 'FORBIDDEN', action: <correcto> }`.

**Resultado real:**
- _[Llenar — listado de status codes por endpoint]_

**Status:** 🔴 EXPECTED FAIL (pre-fix — todos devuelven 401 o 200/201)

---

### AC-6: GET endpoints respetan ownership (no solo rol)

**Pasos:**
1. Login como **inquilino**.
2. `GET /api/properties` → debería pasar 200 (lectura).
3. _(Fase 3)_ Filtrar por ownership — out of scope para este verifier.

**Resultado esperado:**
- Status 200 para cualquier GET.
- El filtro de ownership es **fuera de scope** (Fase 3).

**Status:** ⏳ Pending / ✅ PASS (lectura ya funciona con requireAuth)

---

### AC-7: Propietario recibe 403 en acciones destructivas (delete)

**Pasos:**
1. Login como **propietario**.
2. `DELETE /api/properties/1` → esperado 403 (`canDeleteProperty=false`).
3. `POST /api/tenants` → esperado 403 (`canAddTenant=false`).
4. `DELETE /api/tenants/1` → esperado 403 (`canDeleteTenant=false`).

**Resultado esperado:**
- Todos los destructivos → 403 con código específico.
- Reads y writes permitidos: `GET /api/properties` 200, `PATCH /api/properties/1` 200, `POST /api/properties` 201.

**Resultado real:**
- _[Llenar]_

**Status:** 🔴 EXPECTED FAIL (pre-fix — propietario puede hacer todo lo que admin)

---

### AC-8: Admin siempre pasa `requireRole(action)`

**Pasos:**
1. Login como **admin**.
2. Probar TODOS los endpoints mutadores con datos válidos.
3. TODOS deben pasar (200/201).

**Resultado esperado:**
- Todos pasan con status 2xx.

**Resultado real:**
- _[Llenar — verificar que admin no quedó bloqueado por bug del fix]_

**Status:** ✅ PASS (admin ya pasa con requireAuth)

---

### AC-9: Mensaje de error 403 NO revela si la sesión es válida

**Pasos:**
1. Sin sesión (sin cookie) → `POST /api/properties` → esperado **401 NO_SESSION**.
2. Con sesión de inquilino → `POST /api/properties` → esperado **403 FORBIDDEN**.

**Resultado esperado:**
- Sin sesión: 401 (NO 403).
- Con sesión sin permiso: 403.

**Razón:** Si devuelvo 403 sin validar sesión, leakeo info sobre la existencia del endpoint.

**Resultado real:**
- _[Llenar]_

**Status:** ⏳ Pending / ✅ PASS (el orden de middlewares debería garantizar esto)

---

### AC-10: Tests automatizados comparan matriz server vs frontend

**Pasos:**
1. Leer `tests/permissions-matrix.test.ts` (debe existir post-fix).
2. Correr `npm test`.

**Resultado esperado:**
- Test pasa: las 2 matrices coinciden.
- Si difieren, test falla con diff claro (qué permisos difieren y en qué roles).

**Resultado real:**
- _[Llenar]_

**Status:** 🔴 EXPECTED FAIL (pre-fix — el test no existe)

---

## Edge Cases

### EC-1: Sesión válida pero `role` desconocido

**Pasos:**
1. Crear un usuario en `profiles` con `role='gerente'` (rol futuro no soportado).
2. Login con ese usuario.
3. `POST /api/properties` → esperado 403.

**Resultado esperado:**
- Status 403 con `userRole: 'gerente'`.
- Server loggea warning.

**Status:** 🔴 EXPECTED FAIL (pre-fix) / ⏳ Pending / ✅ PASS

---

### EC-2: Login endpoint (`POST /api/auth/login`)

**Pasos:**
1. Sin sesión → `POST /api/auth/login` con body → esperado 200 (login no requiere rol).

**Resultado esperado:**
- Status 200 (login no usa requireRole).

**Status:** ✅ PASS (login no se rompe)

---

### EC-3: `GET /api/auth/me`

**Pasos:**
1. Sin sesión → 401.
2. Con sesión → 200 con user info.

**Status:** ✅ PASS

---

### EC-7: Tests automatizados con header `X-Test-Role`

**Pasos:**
1. Configurar `NODE_ENV=development` local.
2. Request con header `X-Test-Role: admin` y sin cookie.
3. Esperado: pasa el middleware `requireAuth` (solo en dev) + `requireRole('canAddProperty')` → 200.

**Resultado esperado (dev only):**
- Pasa el bypass de auth (solo dev).
- En producción, el header es ignorado → 401.

**Status:** ⏳ Pending / ✅ PASS (post-fix)

---

## Curl Scripts (parte del verifier)

```powershell
# Guardar como tests/verifiers/fix-issue-permissions-by-endpoint/run-checks.ps1

# Pre-requisito: 3 cookies guardadas en $adminCookie, $propietarioCookie, $inquilinoCookie.

# Test AC-1: Inquilino POST /api/properties → 403
$body = @{
  address = "TEST AC-1"
  chip = "AAA12345"
  folio = "TEST-1"
  ownerName = "Test"
  propertyType = "apartamento"
} | ConvertTo-Json

$res = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/properties" `
  -Method POST -ContentType "application/json" `
  -Body $body `
  -Headers @{ Cookie = "inmocontrol_pilot_session=$inquilinoCookie" } `
  -UseBasicParsing -TimeoutSec 15

if ($res.StatusCode -eq 403) {
  Write-Host "✓ AC-1 PASS (403 Forbidden)" -ForegroundColor Green
} else {
  Write-Host "✗ AC-1 FAIL: Expected 403, got $($res.StatusCode)" -ForegroundColor Red
  Write-Host $res.Content
}

# Test AC-7: Propietario DELETE /api/properties/1 → 403
$res = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/properties/1" `
  -Method DELETE `
  -Headers @{ Cookie = "inmocontrol_pilot_session=$propietarioCookie" } `
  -UseBasicParsing -TimeoutSec 15

if ($res.StatusCode -eq 403) {
  Write-Host "✓ AC-7 PASS (403 Forbidden)" -ForegroundColor Green
} else {
  Write-Host "✗ AC-7 FAIL: Expected 403, got $($res.StatusCode)" -ForegroundColor Red
}

# Test AC-9: Sin sesión → 401
$res = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/properties" `
  -Method POST -ContentType "application/json" -Body $body `
  -UseBasicParsing -TimeoutSec 15

if ($res.StatusCode -eq 401) {
  Write-Host "✓ AC-9 PASS (401 Unauthorized)" -ForegroundColor Green
} else {
  Write-Host "✗ AC-9 FAIL: Expected 401, got $($res.StatusCode)" -ForegroundColor Red
}
```

## Resumen de ejecución

Después de correr todos los checks:

| AC | Status esperado | Notas |
|---|---|---|
| AC-1 | 🔴 EXPECTED FAIL → ✅ PASS | Endpoint rechaza inquilino |
| AC-2 | ✅ PASS | Admin pasa |
| AC-3 | 🔴 EXPECTED FAIL → ✅ PASS | Matriz server creada |
| AC-4 | 🔴 EXPECTED FAIL → ✅ PASS | Todos los endpoints tienen acción |
| AC-5 | 🔴 EXPECTED FAIL → ✅ PASS | Inquilino recibe 403 en todas las mutaciones |
| AC-6 | ✅ PASS | GETs funcionan |
| AC-7 | 🔴 EXPECTED FAIL → ✅ PASS | Propietario no puede borrar |
| AC-8 | ✅ PASS | Admin pasa todo |
| AC-9 | ✅ PASS | 401 sin sesión, 403 con sesión sin permiso |
| AC-10 | 🔴 EXPECTED FAIL → ✅ PASS | Test automatizado existe |

**Veredicto final (post-fix esperado):**
- ✅ ALL PASS → listo para commit + cierre del agujero de seguridad.
- ❌ N FAIL → volver a Fase 4 (implementación), NO tocar este verifier.

## Historial de ejecuciones

| Fecha | Commit deployado | Resultado | Notas |
|-------|------------------|-----------|-------|
| 2026-08-03 | (aún no deployado) | 🔴 EXPECTED FAIL | primera ejecución baseline (estado actual sin fix) |