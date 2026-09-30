# Verifier: SaaS User Management (Invitaciones + Roles) — E2E Checklist

> **Karpathy Verifier** — Septiembre 2026. Cada Acceptance Criterion
> de [`docs/specs/saas_user_mgmt.md`](../../docs/specs/saas_user_mgmt.md)
> se traduce a pasos verificables. **NO modificar este archivo para
> hacer pasar los checks** — si un check falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Local dev corriendo (`npm run dev`).
- MySQL con el schema seedeado + las migraciones 001-015 aplicadas.
- Migración `016_org_invitations.sql` aplicada (ver setup).
- PowerShell 7+, curl.exe, node 18+.
- Un admin user en la org "default" (del seed-pilot) con sesión válida.

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere (adjuntar output real)
- ⚠️ **SKIP** — no verificable ahora (motivo al lado)

### Setup

Antes de los ACs, asegurarse de que:

```sql
-- 1. La migración 016 está aplicada:
--    SHOW TABLES LIKE 'org_invitations';
--    Debe devolver 1 fila con columnas: id, organization_id, email, role,
--    token, invited_by, expires_at, accepted_at, created_by, created_at.

-- 2. Email config está cargado (Fase 7, multi-buzón):
--    SELECT * FROM email_configs WHERE organization_id IS NULL;
--    Si está vacío, los emails van a fallar con EMAIL_FAILED (cubierto por AC-10).

-- 3. Plan trial está seedeado con max_users=2:
--    SELECT slug, max_users FROM saas_plans WHERE slug = 'trial';
--    Debe devolver max_users = 2.

-- 4. Login del admin:
$login = curl.exe -s -i -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@inmocontrol.local","password":"inmo2026!"}' \
  http://localhost:3000/api/auth/login
$cookie = ($login | Select-String "inmocontrol_pilot_session=([^;]+)").Matches[0].Groups[1].Value
```

### Cleanup (al final)

```sql
DELETE FROM org_invitations WHERE email LIKE 'user-mgmt-test-%@example.com';
-- Las invitaciones aceptadas crean profiles; limpiarlos también si EC-2 los creó.
DELETE FROM profiles WHERE email LIKE 'user-mgmt-test-%@example.com';
```

---

## Acceptance Criteria

### AC-1: GET /api/saas-billing/invitations/:token es público

**Pasos:**

1. Crear una invitación como admin (llamar al endpoint de AC-3 primero
   y capturar el `token` del response).
2. Llamar `GET /api/saas-billing/invitations/:token` SIN cookie.
3. Verificar status 200.
4. Verificar body con `email`, `organizationName`, `role`, `expiresAt`.
5. Llamar con un token inventado (`aaaa...` 64 chars).
6. Verificar status 404 con `code: INVITATION_NOT_FOUND`.

**Resultado esperado:**

- Con token real: 200 con metadata.
- Con token fake: 404 JSON.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-2: POST /api/saas-billing/invitations/:token/accept crea profile

**Pasos:**

1. Crear invitación con `email: "user-mgmt-test-ac2@example.com"`,
   `role: "gestor"`. Capturar `token`.
2. Llamar `POST /api/saas-billing/invitations/:token/accept` con body:
   ```json
   { "password": "MiPass123", "displayName": "Gestor Test AC2" }
   ```
3. Verificar status 200.
4. Verificar que el response tiene `user`, `organization`.
5. Verificar `Set-Cookie: inmocontrol_pilot_session=...` en headers.
6. Verificar en DB:
   ```sql
   SELECT id, organization_id, email, role, display_name
   FROM profiles WHERE email = 'user-mgmt-test-ac2@example.com';
   ```
7. Verificar que la invitación tiene `accepted_at IS NOT NULL`.

**Resultado esperado:**

- 200 con cookie. Profile creado con `role='gestor'`, `organization_id`
  de la org del invitador. Invitación marcada como aceptada.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-3: POST /api/saas-billing/invitations (auth + canManageOrgUsers)

**Pasos:**

1. Login como admin (obtener cookie).
2. Llamar `POST /api/saas-billing/invitations` con body:
   ```json
   { "email": "user-mgmt-test-ac3@example.com", "role": "gestor" }
   ```
3. Verificar status 201.
4. Verificar body con `id`, `email`, `role`, `token`, `acceptUrl`, `expiresAt`.
5. Verificar que `token` es hex de 64 chars.
6. Verificar que `acceptUrl` empieza con la URL pública del server.
7. Verificar que `expiresAt` es ~7 días en el futuro (±1 min).

**Resultado esperado:**

- 201 con todos los campos. Token hex 64. `acceptUrl` es una URL válida.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-4: GET /api/saas-billing/invitations lista invitaciones de la org

**Pasos:**

1. (Reusar setup de AC-3) Login admin.
2. Llamar `GET /api/saas-billing/invitations`.
3. Verificar status 200.
4. Verificar que el array `invitations` incluye la invitación de AC-3
   con `status='pending'`.

**Resultado esperado:**

- 200 con array que incluye la invitación recién creada.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-5: DELETE /api/saas-billing/invitations/:id

**Pasos:**

1. Crear una invitación nueva (AC-3 con email distinto).
2. Llamar `DELETE /api/saas-billing/invitations/:id` con cookie admin.
3. Verificar status 204.
4. Verificar en DB que la fila ya no existe:
   ```sql
   SELECT * FROM org_invitations WHERE id = :id;
   ```
5. Bonus: intentar borrar una invitación `accepted` (la de AC-2) →
   debería dar 409 o 400 (no se puede borrar lo aceptado).

**Resultado esperado:**

- DELETE de pending: 204, fila borrada.
- DELETE de accepted: 409 `code: CANNOT_DELETE_ACCEPTED_INVITATION`.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-6: GET /api/saas-billing/members

**Pasos:**

1. Login admin.
2. Llamar `GET /api/saas-billing/members`.
3. Verificar status 200.
4. Verificar que el array `members` incluye al admin (con
   `isOrgOwner: true`) y al guest de AC-2 (si fue aceptado).

**Resultado esperado:**

- 200 con array. Admin aparece con `isOrgOwner: true`.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-7: PATCH /api/saas-billing/members/:id cambia rol

**Pasos:**

1. (Reusar AC-2) El guest fue creado con `role='gestor'`.
2. Login admin.
3. Llamar `PATCH /api/saas-billing/members/:id` con `{ "role": "propietario" }`.
4. Verificar status 200.
5. Verificar en DB que el `role` del profile cambió.

**Resultado esperado:**

- 200 con el member actualizado. DB muestra `role='propietario'`.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-8: DELETE /api/saas-billing/members/:id no permite borrar al admin original

**Pasos:**

1. Login admin.
2. Llamar `DELETE /api/saas-billing/members/:adminId` (con el ID del admin
   original de la org).
3. Verificar status 409 con `code: CANNOT_REMOVE_ORG_OWNER`.

**Resultado esperado:**

- 409 JSON, no se borra.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-9 + AC-10: Email enviado (o warning si falla)

**Pasos:**

1. Crear invitación (AC-3).
2. Verificar que el server logueó "email sent" o "EMAIL_FAILED" en consola.
3. **AC-9**: si `emailConfig` está configurado, el mail sale sin error.
   **AC-10**: si no está configurado o SMTP está caído, status 201
   - `warning: 'EMAIL_FAILED'` en el body.

**Resultado esperado:**

- AC-9: mail enviado, sin warning.
- AC-10: warning presente, log de error en consola.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-11 + AC-12: Plan limit reached

**Pasos:**

1. Estado: la org tiene 1 admin + max_users=2 (trial).
2. Crear 1 invitación `pending` (consume el slot).
3. Intentar crear una 2da invitación.
4. Verificar status 402 con `code: PLAN_LIMIT_REACHED` y mensaje
   mencionando el plan name y el límite.

**Resultado esperado:**

- 2da invitación rechazada con 402.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-14: Aislamiento multi-tenant

**Pasos:**

1. Crear Org B (similar a `tests/verifiers/saas_multitenant.md` setup).
2. Crear admin de Org B.
3. Login como Org A admin. Crear invitación en Org A.
4. Logout.
5. Login como Org B admin.
6. Llamar `GET /api/saas-billing/invitations` con cookie de Org B.
7. Verificar que la invitación de Org A **NO aparece** en la lista.
8. Llamar `GET /api/saas-billing/invitations/:tokenDeOrgA` con cookie Org B.
9. Verificar 404 (Org B no debería poder ver invitaciones de Org A
   aunque conozca el token).

**Resultado esperado:**

- Org B solo ve sus propias invitaciones. Token de Org A es invisible
  para Org B.

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

### AC-15: Email único por org, no global

**Pasos:**

1. Login admin Org A. Crear invitación para `cross-org@example.com`.
2. Login admin Org B (de AC-14). Crear invitación para el mismo email.
3. Verificar que ambas invitaciones se crean OK (200/201 cada una).
4. Verificar en DB que hay 2 filas con ese email pero
   `organization_id` distintos.

**Resultado esperado:**

- 2 invitaciones coexisten (cada una con su `organization_id`).

**Resultado real:**

- [Llenar]

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Email inválido al invitar

**Pasos:**

1. Login admin.
2. `POST /invitations` con `{ "email": "no-es-email", "role": "gestor" }`.
3. Verificar 400 con `code: INVALID_EMAIL`.

**Status:** ⏳ Pending

---

### EC-2: Rol inválido

**Pasos:**

1. Login admin.
2. `POST /invitations` con `{ "email": "x@y.com", "role": "superadmin" }`.
3. Verificar 400 con `code: INVALID_ROLE`.

**Status:** ⏳ Pending

---

### EC-3: Email ya es miembro

**Pasos:**

1. Login admin. Aceptar una invitación para `dup@example.com` (queda
   como `gestor`).
2. `POST /invitations` con `{ "email": "dup@example.com", "role": "gestor" }`.
3. Verificar 409 con `code: EMAIL_ALREADY_MEMBER`.

**Status:** ⏳ Pending

---

### EC-6: Token de aceptación malformado

**Pasos:**

1. `POST /api/saas-billing/invitations/abc123/accept`.
2. Verificar 404 con `code: INVITATION_NOT_FOUND`.

**Status:** ⏳ Pending

---

### EC-7: Token expirado

**Pasos:**

1. Crear invitación.
2. Modificar en DB: `UPDATE org_invitations SET expires_at = NOW() - INTERVAL 1 DAY WHERE id = ?`.
3. `POST /api/saas-billing/invitations/:token/accept` con password válido.
4. Verificar 404 con `code: INVITATION_EXPIRED`.

**Status:** ⏳ Pending

---

### EC-8: Token ya aceptado

**Pasos:**

1. Aceptar una invitación (queda `accepted_at IS NOT NULL`).
2. `POST /api/saas-billing/invitations/:token/accept` de nuevo.
3. Verificar 404 con `code: INVITATION_ALREADY_ACCEPTED`.

**Status:** ⏳ Pending

---

### EC-9: Intentar borrar admin original

**Pasos:**

Cubierto por AC-8 (es el mismo path).

**Status:** ⏳ Pending

---

### EC-15: Sesión de otra org al aceptar

**Pasos:**

1. Login admin Org A.
2. Crear invitación para `cross-org-user@example.com` en Org B
   (alternativa: login admin Org A, aceptar invitación de Org B).
3. Si el invitado ya tiene sesión de Org A, intentar aceptar invitación
   de Org B con esa cookie.
4. Verificar 409 con `code: ALREADY_AUTHENTICATED_OTHER_ORG`.

**Status:** ⏳ Pending

---

### EC-17: Reenviar mail de invitación pending

**Pasos:**

1. Crear invitación (AC-3).
2. `POST /api/saas-billing/invitations/:id/resend` con cookie admin.
3. Verificar status 200 con nuevo `acceptUrl` y `expiresAt`.
4. Verificar en DB que el `token` CAMBIÓ y `expires_at` se extendió.

**Status:** ⏳ Pending

---

## Resumen de ejecución

> Última corrida: **⏳ nunca corrido** (spec nuevo, sin impl todavía).
> Esperado: **todos los ACs y ECs deben dar FAIL** porque la impl
> no existe. Cuando se implemente (FASE 4), se vuelve a correr y se
> espera que todo pase.

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
| AC-14 | ⏳        |           |
| AC-15 | ⏳        |           |
| EC-1  | ⏳        |           |
| EC-2  | ⏳        |           |
| EC-3  | ⏳        |           |
| EC-6  | ⏳        |           |
| EC-7  | ⏳        |           |
| EC-8  | ⏳        |           |
| EC-9  | ⏳        |           |
| EC-15 | ⏳        |           |
| EC-17 | ⏳        |           |

**Total checks:** 23 (14 ACs + 9 ECs)

**Expected outcome (per spec):**

- ANTES de la impl: todos los 23 checks dan **❌ FAIL** con
  `404 / 500 / 401` (los endpoints no existen).
- DESPUÉS de la impl: todos los 23 checks deben dar **✅ PASS**.
- Si algún check da `⚠️ SKIP`, documentar el motivo.
