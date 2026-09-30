# Verifier: SaaS Multi-Tenant Real — E2E Checklist

> **Karpathy Verifier** — Septiembre 2026. Cada Acceptance Criterion
> de `docs/specs/saas_multitenant.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un
> check falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- **Local dev** corriendo: `npm run dev` (Vite 3000 + Express 3001).
- **MySQL** local con el schema seedeado (`scripts/seed-pilot.mjs`).
- **PowerShell 7+** en Windows.
- **curl.exe** (viene con Windows 10+).
- **node 18+** con el package `mysql2` instalado (ya está en
  `dependencies`).

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere (adjuntar output real)
- ⚠️ **SKIP** — no verificable ahora (motivo al lado)

### Setup de la prueba

Para verificar el aislamiento multi-tenant **necesitamos 2 orgs con
datos cruzados**. El seed actual solo crea 1 org. Antes de correr
los ACs:

```sql
-- 1. Crear una org "extra" para Org B
INSERT INTO organizations (id, name, nit, created_by) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Org B Test', NULL, 'test-verifier');

-- 2. Crear un admin user para Org B
INSERT INTO profiles (id, organization_id, display_name, email, role, password_hash, created_by) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Admin Org B', 'adminb@test.com', 'admin',
   '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',  -- hash de "test1234"
   'test-verifier');

-- 3. Crear una property en Org B (para los tests de aislamiento)
INSERT INTO properties (id, address, status, organization_id, owner_name, created_by) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10',
   'TEST-OrgB-Property', 'Pendiente',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Owner B', 'test-verifier');

-- 4. Limpiar al final
DELETE FROM properties WHERE address = 'TEST-OrgB-Property';
DELETE FROM profiles WHERE email = 'adminb@test.com';
DELETE FROM organizations WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
```

> **Nota**: el hash bcrypt `$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW`
> es la password `test1234` hasheada. Si la verificación falla,
> regenerar con `node -e "import('bcryptjs').then(b => console.log(b.hashSync('test1234', 10)))"`.

### Login de los 2 admin users

```powershell
# Org A (admin del seed)
$loginA = curl.exe -s -i -X POST -H "Content-Type: application/json" -d '{"email":"admin@inmocontrol.local","password":"inmo2026!"}' http://localhost:3000/api/auth/login
$cookieA = ($loginA | Select-String "inmocontrol_pilot_session=([^;]+)").Matches[0].Groups[1].Value
# $cookieA = "uuid-org-a"

# Org B (admin nuevo)
$loginB = curl.exe -s -i -X POST -H "Content-Type: application/json" -d '{"email":"adminb@test.com","password":"test1234"}' http://localhost:3000/api/auth/login
$cookieB = ($loginB | Select-String "inmocontrol_pilot_session=([^;]+)").Matches[0].Groups[1].Value
# $cookieB = "uuid-org-b"
```

---

## Acceptance Criteria

### AC-1: GET /api/properties filtra por organización

**Pasos:**

1. Loguearse como admin de Org B.
2. Llamar `GET /api/properties` con la cookie de Org B.
3. Verificar que la respuesta **NO** incluye la property
   `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10` (que es de Org B, así que
   sí debería estar) **Y tampoco** las properties de Org A.

**Resultado esperado:**

- Solo aparecen properties con `organization_id = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`.

**Resultado real:**

- [Llenar después de ejecutar]

**Status:** ⏳ Pending

---

### AC-2: GET /api/properties/:id devuelve 404 cross-tenant

**Pasos:**

1. Loguearse como admin de Org A.
2. Llamar `GET /api/properties/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10` con la cookie de Org A.
3. Verificar status = 404 y body con `code: PROPERTY_NOT_FOUND`.

**Resultado esperado:**

```json
{
  "error": "No se encontró la propiedad con id=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10",
  "code": "PROPERTY_NOT_FOUND"
}
```

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-3: GET /api/tenants filtra por organización

**Pasos:**

1. Crear un tenant de Org B (opcional, si no hay).
2. Loguearse como admin de Org A.
3. Llamar `GET /api/tenants` con la cookie de Org A.
4. Verificar que ningún tenant de Org B aparece en el listado.

**Resultado esperado:**

- Lista vacía o solo tenants de Org A.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-4: GET /api/entities/contracts filtra por organización

**Pasos:**

1. Loguearse como admin de Org A.
2. Llamar `GET /api/entities/contracts` con la cookie de Org A.
3. Verificar que ningún contract de Org B aparece.

**Resultado esperado:**

- Solo contracts de Org A.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-5: GET /api/billing/policies/:propertyId devuelve 404 cross-tenant

**Pasos:**

1. Crear una `billing_policies` para la property de Org B.
2. Loguearse como admin de Org A.
3. Llamar `GET /api/billing/policies/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10` con la cookie de Org A.
4. Verificar status = 404 (NO 200, NO 403).

**Resultado esperado:**

```json
{
  "error": "No se encontró la política para propertyId=...",
  "code": "POLICY_NOT_FOUND"
}
```

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-6: GET /api/financial-records y /api/inventories filtran por org (vía FK transitiva)

**Pasos:**

1. Crear un `property_charges` y un `inventories` para la property de Org B.
2. Loguearse como admin de Org A.
3. Llamar `GET /api/financial-records` y `GET /api/inventories` con la cookie de Org A.
4. Verificar que los registros de Org B NO aparecen.

**Resultado esperado:**

- Solo registros de Org A.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-7: POST /api/properties con organizationId ajeno devuelve 403

**Pasos:**

1. Loguearse como admin de Org A.
2. Llamar `POST /api/properties` con body que incluye
   `organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"`.
3. Verificar status = 403.

**Body de ejemplo:**

```json
{
  "organizationId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "address": "TEST-ATTACK-CrossTenant",
  "ownerName": "Atacante"
}
```

**Resultado esperado:**

```json
{
  "error": "No podés crear recursos en otra organización",
  "code": "CROSS_TENANT_FORBIDDEN"
}
```

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-8: POST /api/tenants y /api/contracts con organizationId ajeno devuelven 403

**Pasos:**

1. Igual que AC-7 pero con `POST /api/tenants` y
   `POST /api/entities/contracts`.

**Resultado esperado:**

- Status 403 con `code: CROSS_TENANT_FORBIDDEN`.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-9: PATCH /api/entities/contracts/:id valida org

**Pasos:**

1. Crear un contract en Org B.
2. Loguearse como admin de Org A.
3. Llamar `PATCH /api/entities/contracts/<contractId-de-OrgB>` con body
   válido.
4. Verificar status = 404 con `code: CONTRACT_NOT_FOUND`.

**Resultado esperado:**

- 404, no 200, no 403.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-10: PUT /api/billing/policies/:propertyId valida org

**Pasos:**

1. Loguearse como admin de Org A.
2. Llamar `PUT /api/billing/policies/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10`
   con un body válido.
3. Verificar status = 404 (NO se crea/actualiza la policy).

**Resultado esperado:**

- 404 con `code: PROPERTY_NOT_FOUND` o `POLICY_NOT_FOUND`.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-11: DELETE /api/properties/:id valida org

**Pasos:**

1. Loguearse como admin de Org A.
2. Llamar `DELETE /api/properties/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10`.
3. Verificar status = 404 (no se borra la property de Org B).

**Resultado esperado:**

- 404, no 200, no 403.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-12: getOrgIdForRequest() reemplaza ensureDefaultOrg() en routers

**Pasos:**

1. Verificar el código de cada router:
   - `server/routes/properties.ts` — ¿usa `getOrgIdForRequest` en
     lugar de `ensureDefaultOrg` en los endpoints autenticados?
   - `server/routes/tenants.ts` — idem.
   - `server/routes/entities.ts` — idem.
   - `server/routes/billing.ts` — idem.
   - `server/routes/financialRecords.ts` — idem.
   - `server/routes/inventories.ts` — idem.
   - `server/routes/saasBilling.ts` — idem.
2. Verificar que `getOrgIdForRequest` está exportado de
   `server/lib/orgContext.ts`.
3. Verificar que `ensureDefaultOrg` SOLO se usa en:
   - `server/db.ts` (para bootstrap)
   - `server/seed/pilotSeed.ts` (para el seed)
   - `server/lib/orgContext.ts` (como fallback)

**Resultado esperado:**

- 0 usos de `ensureDefaultOrg` fuera de los 3 lugares listados arriba
  (en routers autenticados).

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-13: requireAuth rechaza sesiones sin organizationId

**Pasos:**

1. Crear manualmente una sesión en el `sessions` Map SIN
   `organizationId` (vía un script node, o modificando temporalmente
   `auth.ts`).
2. Llamar `GET /api/properties` con esa cookie.
3. Verificar status = 401 con `code: SESSION_MISSING_ORG`.

**Resultado esperado:**

```json
{ "error": "Sesión inválida", "code": "SESSION_MISSING_ORG" }
```

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-14: El seed sigue creando la org default

**Pasos:**

1. Verificar que `scripts/seed-pilot.mjs` sigue corriendo y crea
   la org `InmoControl Default`.
2. Loguearse con `admin@inmocontrol.local` / `inmo2026!` y ver
   que el endpoint `/api/auth/me` devuelve `organizationId`.

**Resultado esperado:**

- El seed funciona sin cambios. La sesión del admin del seed tiene
  `organizationId = "00000000-0000-0000-0000-000000000001"`.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-15: Los tests E2E existentes siguen pasando contra el piloto

**Pasos:**

1. Correr `bash scripts/verifier-wizard-property.ps1` (o el equivalente
   local).
2. Verificar que AC-1 a AC-6 del wizard_property siguen ✅ PASS.
3. Si alguno falla → el fix rompió compat con el seed.

**Resultado esperado:**

- Los verifiers existentes pasan sin cambios.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Sesión sin organizationId (legacy)

**Pasos:**

1. Crear una sesión manualmente sin `organizationId` (ver AC-13).
2. Llamar cualquier endpoint autenticado.
3. Verificar 401 con `code: SESSION_MISSING_ORG`.

**Resultado esperado:**

- 401 claro, frontend fuerza re-login.

**Status:** ⏳ Pending

---

### EC-2: Body trae organizationId que coincide con el del user

**Pasos:**

1. Loguearse como admin de Org A (org `00000000-...-0001`).
2. POST /api/properties con `organizationId: "00000000-...-0001"`
   (mismo que `req.user.organizationId`).
3. Verificar status = 200 (no 403).

**Resultado esperado:**

- 200 OK. El body repite el orgId, no hay info-leak.

**Status:** ⏳ Pending

---

### EC-3: organizationId del user cambia mid-session

**Pasos:**

1. Loguearse como admin de Org A.
2. (En un script de admin) cambiar el `organizationId` del profile a
   otra org.
3. Llamar `GET /api/properties`.
4. Verificar que la respuesta refleja el nuevo org (no el viejo).

**Resultado esperado:**

- Comportamiento correcto. El req.user.organizationId actual se usa
  en cada request.

**Status:** ⏳ Pending

---

### EC-4: Datos huérfanos con organization_id = NULL

**Pasos:**

1. Insertar manualmente una property con `organization_id = NULL`:
   ```sql
   INSERT INTO properties (id, address, status, organization_id, owner_name, created_by)
   VALUES ('null-org-prop-uuid', 'TEST-NULL-Org', 'Pendiente', NULL, 'Owner Null', 'test-verifier');
   ```
2. Loguearse como admin de Org A y llamar `GET /api/properties`.
3. Verificar que la property NULL **NO** aparece (es de "ninguna" org,
   por seguridad).

**Resultado esperado:**

- Solo properties de Org A.

**Status:** ⏳ Pending

---

### EC-5: DB drift — tabla nueva sin organization_id

**Pasos:**

1. (Hipotético) Simular drift: una tabla existe pero no tiene
   `organization_id`.
2. El server loguea warning si hay nulls.
3. El admin del seed (AC-14) sigue viendo esas rows.
4. Otros usuarios NO.

**Resultado esperado:**

- Comportamiento defensivo, no rompe el server.

**Status:** ⏳ Pending

---

### EC-6: Una org sin properties

**Pasos:**

1. Loguearse como admin de Org B (que no tiene properties).
2. Llamar `GET /api/properties`.
3. Verificar que devuelve `[]` (no 404).

**Resultado esperado:**

- `200 OK` con `{"properties":[]}`.

**Status:** ⏳ Pending

---

### EC-7: Una org sin BillingPolicy

**Pasos:**

1. Loguearse como admin de Org B (sin policy).
2. Llamar `GET /api/billing/policies/<propertyId-de-OrgB>`.
3. Verificar que devuelve 404 (no 500, no HTML).

**Resultado esperado:**

- 404 con `code: POLICY_NOT_FOUND`.

**Status:** ⏳ Pending

---

### EC-8: Performance — el middleware agrega latencia mínima

**Pasos:**

1. Medir tiempo de `GET /api/properties` antes del fix.
2. Aplicar el fix.
3. Medir de nuevo.
4. Diff < 5ms.

**Resultado esperado:**

- Diff despreciable (<5ms p99).

**Status:** ⏳ Pending

---

## Curl Scripts

```powershell
# Setup: crear org B, admin B, property B
$setupSql = @"
INSERT IGNORE INTO organizations (id, name, nit, created_by) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Org B Test', NULL, 'test-verifier');
INSERT IGNORE INTO profiles (id, organization_id, display_name, email, role, password_hash, created_by) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Admin Org B', 'adminb@test.com', 'admin',
   '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
   'test-verifier');
INSERT IGNORE INTO properties (id, address, status, organization_id, owner_name, created_by) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10',
   'TEST-OrgB-Property', 'Pendiente',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Owner B', 'test-verifier');
"@

# Pegar en phpMyAdmin → SQL, o ejecutar via node mysql2.

# Login Org A
$loginA = curl.exe -s -i -X POST -H "Content-Type: application/json" `
  -d '{"email":"admin@inmocontrol.local","password":"inmo2026!"}' `
  http://localhost:3000/api/auth/login
$cookieA = ([regex]::Match($loginA, "inmocontrol_pilot_session=([^;]+)")).Groups[1].Value

# Login Org B
$loginB = curl.exe -s -i -X POST -H "Content-Type: application/json" `
  -d '{"email":"adminb@test.com","password":"test1234"}' `
  http://localhost:3000/api/auth/login
$cookieB = ([regex]::Match($loginB, "inmocontrol_pilot_session=([^;]+)")).Groups[1].Value

# AC-1: GET /api/properties con cookie de Org A → no debe incluir property de Org B
$ac1 = curl.exe -s -i -H "Cookie: inmocontrol_pilot_session=$cookieA" `
  http://localhost:3000/api/properties
# Verificar que el body no incluye 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10'

# AC-2: GET /api/properties/bbbbbbbb-...-10 con cookie de Org A → 404
$ac2 = curl.exe -s -i -H "Cookie: inmocontrol_pilot_session=$cookieA" `
  http://localhost:3000/api/properties/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10
# Verificar status 404

# Cleanup
$cleanupSql = @"
DELETE FROM properties WHERE address = 'TEST-OrgB-Property';
DELETE FROM profiles WHERE email = 'adminb@test.com';
DELETE FROM organizations WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
"@
```

---

## Resumen de ejecución

| AC    | Resultado | Evidencia |
| ----- | --------- | --------- |
| AC-1  | ⏳        |           |
| AC-2  | ⏳        |           |
| AC-3  | ⏳        |           |
| AC-4  | ⏳        |           |
| AC-5  | ⏳        |           |
| AC-6  | ⏳        |           |
| AC-7  | ⏳        |           |
| AC-8  | ⏳        |           |
| AC-9  | ⏳        |           |
| AC-10 | ⏳        |           |
| AC-11 | ⏳        |           |
| AC-12 | ⏳        |           |
| AC-13 | ⏳        |           |
| AC-14 | ⏳        |           |
| AC-15 | ⏳        |           |
| EC-1  | ⏳        |           |
| EC-2  | ⏳        |           |
| EC-3  | ⏳        |           |
| EC-4  | ⏳        |           |
| EC-5  | ⏳        |           |
| EC-6  | ⏳        |           |
| EC-7  | ⏳        |           |
| EC-8  | ⏳        |           |

**Total checks:** 23 (15 ACs + 8 ECs)

**Expected outcome (per spec):**

- AC-1, AC-2, AC-3, AC-4, AC-5, AC-6: ❌ FAIL antes del fix (la query actual no filtra por org correctamente, ver server/db.ts `ensureDefaultOrg`).
- AC-7, AC-8, AC-9, AC-10, AC-11: ❌ FAIL antes del fix (no hay validación cross-tenant).
- AC-12, AC-13: ❌ FAIL antes del fix (no existe `getOrgIdForRequest`, `requireAuth` no valida orgId).
- AC-14, AC-15: ✅ PASS antes del fix (compat con seed).
- EC-1: ❌ FAIL (no hay validación de orgId en sesión).
- EC-2: ⚠️ Pasa por accidente (no hay validación, se acepta todo).
- EC-3: ⚠️ No testeable sin el fix (depende del helper).
- EC-4: ❌ FAIL antes del fix (Org A ve TODO, incluyendo nulls).
- EC-5: ⚠️ No aplica sin drift.
- EC-6: ✅ Pasa (devuelve `[]` si no hay properties, pero de todas las orgs).
- EC-7: ❌ FAIL (devuelve 404 porque no existe, pero por otra razón).
- EC-8: ⚠️ Pasa por diseño (no hay overhead perceptible).

> **Nota importante**: este verifier está escrito para correr **después del fix**. Antes del fix, los ACs 1-11, 13, EC-1, EC-4, EC-7 van a **fallar** (eso es lo correcto: el verifier reproduce los bugs actuales). El implementador (FASE 4) tiene que lograr que pasen todos.
