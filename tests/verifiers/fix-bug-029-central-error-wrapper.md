# Verifier: Fix BUG-029 — Central error wrapper

> **Karpathy Verifier** — Agosto 2026. Cada AC de
> `docs/specs/fix-bug-029-central-error-wrapper.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un check
> falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io`
- PowerShell 7+ (o PS5) en Windows

---

## Pre-check

### PRE-1: Health check

```powershell
$h = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/health" -UseBasicParsing -TimeoutSec 10
Write-Host "Status: $($h.StatusCode)"
```

**Status:** ⏳ Pending

---

## Acceptance Criteria

### AC-1: Existe `server/lib/asyncHandler.ts`

**Pasos:**
1. Verificar que el archivo existe: `ls server/lib/asyncHandler.ts`.
2. **Verificar**: exporta una función `asyncHandler` que toma un async handler y devuelve un `RequestHandler`.
3. **Verificar**: el wrapper usa `Promise.resolve(fn(...)).catch(next)` para capturar errores sync y async.
4. **Verificar**: NO se importa `express-async-errors` ni similares (cero deps nuevas).

**Status:** ⏳ Pending

---

### AC-2: Existe middleware central de errores en `server.ts`

**Pasos:**
1. Verificar: `server/lib/errorHandler.ts` existe.
2. **Verificar**: `server.ts` importa `errorHandler` y lo registra con `app.use(errorHandler)`.
3. **Verificar**: el middleware tiene la firma de 4 argumentos `(err, req, res, next)`.
4. **Verificar**: detecta `err.type === 'entity.parse.failed'` y devuelve 400 con `code: 'INVALID_JSON'`.

**Status:** ⏳ Pending

---

### AC-3: Migración de los 6 endpoints con el antipatrón

**Pasos:**
1. Para cada uno de los 6 endpoints:
   - `POST /api/billing/policies/:propertyId` (billing.ts:165-166)
   - `POST /api/billing/amortization/generate` (billing.ts:214-215)
   - `POST /api/inventories` (inventories.ts:98-153)
   - `POST /api/billing/payments` (billing.ts:296-340)
   - `POST /api/properties` (properties.ts:273-300)
   - Endpoints de `googleAuth.ts`
2. **Verificar**: cada handler ahora usa `asyncHandler(async (req, res) => { ... })` (no `try { ... }` local).
3. **Verificar**: NO hay `await ensureDefaultOrg()` (o equivalente) ANTES del asyncHandler.
4. **Verificar**: NO hay `res.status(500).json({ error: ... })` local (ahora es el middleware central).

**Status:** ⏳ Pending

---

### AC-4: Handlers existentes con try local SE PRESERVAN

**Pasos:**
1. `tenants.ts`, `properties.ts`, `entities.ts`, `saasBilling.ts` deben seguir teniendo su `try { ... }` local.
2. **Verificar**: NO se rompieron durante la migración.
3. **Verificar**: un POST a `/api/tenants` con body inválido sigue devolviendo 400 JSON (no HTML).

**Status:** ⏳ Pending

---

### AC-5: El response shape es siempre JSON

**Pasos (con curl directo a prod):**

```powershell
# Body malformado
$h = Invoke-WebRequest -Method POST -Uri "https://inmocontrol.tecnowebsupportia.com/api/properties" -Headers @{"Content-Type"="application/json"} -Body "xxx" -UseBasicParsing -TimeoutSec 10
Write-Host "Status: $($h.StatusCode) Content-Type: $($h.Headers['Content-Type'])"
Write-Host $h.Content
```

**Esperado**:
- Status: `400` (NO 500)
- Content-Type: `application/json` (NO `text/html`)
- Body: `{ "error": "Unexpected token...", "code": "INVALID_JSON" }` (JSON parseado, NO HTML)

**Status:** ⏳ Pending

---

### AC-6: No se introdujeron nuevas dependencias

**Pasos:**
1. `git diff package.json` → **Verificar**: NO se agregaron deps.
2. `git diff package-lock.json` → **Verificar**: NO se agregaron deps transitivas.

**Status:** ⏳ Pending

---

### AC-7: Compatibilidad con el flujo Karpathy (2 commits)

**Pasos:**
1. `git log --oneline -3` → **Verificar**: hay 2 commits separados del fix (1 para el wrapper, 1 para la migración de endpoints).
2. Cada commit pasa `npm run lint` exit 0.
3. La app arranca correctamente entre los 2 commits (revisar el output de `npm run dev`).

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Error de sintaxis JSON en el body

**Pasos:**
1. `curl -X POST -H "Content-Type: application/json" -d 'xxx' https://inmocontrol.tecnowebsupportia.com/api/properties`
2. **Verificar**: status 400, Content-Type `application/json`, body con `code: 'INVALID_JSON'`.
3. Repetir para `/api/billing/policies/X`, `/api/inventories`, `/api/contracts/xxx`, `/api/tenants`.
4. **Verificar**: TODOS devuelven 400 JSON, no 500 HTML.

**Status:** ⏳ Pending

---

### EC-2: Error de FK constraint en MySQL

**Pasos:**
1. Intentar crear un inventario con `propertyId` inválido.
2. **Esperado**: 500 JSON con `code: 'INTERNAL'` (genérico, no leak del SQL).
3. **Verificar** en server logs: el error SQL original se logueó con stack.

**Status:** ⏳ Pending

---

### EC-3: Abort del cliente

**Pasos:**
1. `curl --max-time 1` (1 segundo) a un endpoint lento.
2. **Esperado**: el server loguea como warning, no como error.
3. **Verificar**: el cliente recibe error de timeout, pero el server no entra en panic.

**Status:** ⏳ Pending

---

### EC-4: Error en llamada a Google Drive

**Pasos:**
1. Con Drive desconectado (logout), intentar una operación de Drive.
2. **Esperado**: 500 JSON con `code: 'INTERNAL'`.
3. **Verificar** en server logs: el error de Drive se logueó.

**Status:** ⏳ Pending

---

### EC-5: Handler con asyncHandler que tira un error sync

**Pasos:**
1. Temporalmente, agregar a un endpoint:
   ```ts
   router.get('/test-sync-error', asyncHandler((req, res) => {
     throw new Error('test sync error');
   }));
   ```
2. `curl https://inmocontrol.tecnowebsupportia.com/api/test-sync-error`
3. **Verificar**: 500 JSON, NO 500 HTML.
4. **Revertir** el cambio temporal antes de commitear.

**Status:** ⏳ Pending

---

## Resumen

| Tipo | Cantidad |
|------|----------|
| Pre-checks | 1 (PRE-1) |
| Acceptance Criteria | 7 (AC-1 a AC-7) |
| Edge Cases | 5 (EC-1 a EC-5) |
| **Total checks** | **13** |

---

## Aprobación

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]
