# Feature: Gestión de Usuarios por Organización (Invitaciones + Roles)

> **Karpathy Spec** — Septiembre 2026. Define el flujo de invitación
> de usuarios a una organización InmoControl y la gestión de su rol
> dentro de la org. NO incluye código de implementación. Una vez
> aprobado, sigue `tests/verifiers/saas_user_mgmt.md`.

## 0. Contexto (por qué este spec existe)

InmoControl es SaaS multi-tenant. Hoy el signup crea la org + 1 admin
([`saas_signup.md`](saas_signup.md)). El outline de roadmap
([`saas_roadmap.md` Spec 4](saas_roadmap.md)) proponía que el admin
pudiera invitar a colegas con roles diferenciados, pero **hoy no
existe**:

- ❌ No hay tabla `org_invitations` (verificado grep: 0 referencias).
- ❌ No hay endpoint `POST /api/saas-billing/invitations`.
- ❌ No hay acción `canManageOrgUsers` en la matriz de permisos
  ([`server/lib/permissions.ts`](../../server/lib/permissions.ts)).
- ❌ El rol `gestor` está en el CHECK constraint de la DB
  ([`db/mysql/schema-hostinger.sql:47`](../../db/mysql/schema-hostinger.sql))
  pero NO en el type `Role` de TypeScript — drift silencioso.

Este spec cierra los 4 huecos.

## 1. User Story

**As a** admin de una agencia en InmoControl,
**I want to** invitar a mis colegas (gestores, propietarios) por email
con un magic link de aceptación + asignarles un rol,
**So that** cada uno vea solo lo que necesita y mis datos queden
organizados por persona, no todos revueltos con un solo login.

## 2. Acceptance Criteria (numerados, binarios)

### Endpoint público de aceptación

- **AC-1**: `GET /api/saas-billing/invitations/:token` es **público**
  (no requiere auth) y devuelve 200 con la metadata de la invitación
  (`email`, `organizationName`, `role`, `expiresAt`, `acceptedAt`).
  Si el token es inválido, expirado o ya aceptado → 404 JSON
  `code: INVITATION_NOT_FOUND`.
- **AC-2**: `POST /api/saas-billing/invitations/:token/accept` es
  **público**, recibe `{ password }` (el invitado completa su
  contraseña), y crea un `profile` nuevo con:
  - `id = crypto.randomUUID()`
  - `organization_id = invitation.organization_id`
  - `email = invitation.email` (lowercase, trimmed)
  - `display_name` (input del form, default = parte local del email)
  - `role = invitation.role`
  - `password_hash = bcrypt.hash(password, 10)`
  - `created_by = invitation.email`
    Marca la invitación como `accepted_at = NOW()`.
    Devuelve 200 con `Set-Cookie: inmocontrol_pilot_session=...` (loguea
    al usuario automáticamente) y body con `user`, `organization`.

### Endpoint autenticado de creación

- **AC-3**: `POST /api/saas-billing/invitations` requiere
  `requireAuth` + acción `canManageOrgUsers`. Solo `admin` la tiene
  en v1. Recibe `{ email, role }` y:
  - Valida `email` (regex RFC-5322 básico, mismo helper que signup).
  - Valida `role` ∈ `{gestor, propietario, inquilino}` (NO se puede
    invitar a otro `admin` por este endpoint — solo el admin original
    de la org puede serlo).
  - Valida que el `email` NO exista ya en `profiles` de la misma org.
    Si existe → 409 `code: EMAIL_ALREADY_MEMBER`.
  - Valida que la org NO haya llegado a `max_users` del plan activo.
    Si llegó → 402 `code: PLAN_LIMIT_REACHED` con mensaje
    `"Llegaste al límite de {N} usuarios de tu plan {planName}. Actualizá tu plan para invitar más."`.
  - Genera `token = crypto.randomBytes(32).toString('hex')` (64 chars).
  - Inserta fila en `org_invitations` con `expires_at = NOW() + INTERVAL 7 DAY`.
  - Envía email con magic link: `${PUBLIC_URL}/accept-invitation?token={token}`.
  - Devuelve 201 con `{ id, email, role, token, acceptUrl, expiresAt }`.
    El `token` y `acceptUrl` también se loguean en consola del server
    (para debugging cuando el SMTP falla; el `acceptUrl` es lo que
    el usuario realmente recibe en el mail).

- **AC-4**: `GET /api/saas-billing/invitations` requiere auth y la
  misma acción `canManageOrgUsers`. Lista TODAS las invitaciones de
  la org (pendientes, aceptadas, expiradas). Devuelve 200 con
  `[{ id, email, role, status, createdAt, expiresAt, acceptedAt }]`.
  `status` se calcula server-side:
  - `'pending'` si `accepted_at IS NULL` y `expires_at > NOW()`.
  - `'accepted'` si `accepted_at IS NOT NULL`.
  - `'expired'` si `accepted_at IS NULL` y `expires_at <= NOW()`.

- **AC-5**: `DELETE /api/saas-billing/invitations/:id` requiere auth
  y `canManageOrgUsers`. Solo se pueden borrar invitaciones
  `pending` o `expired` (NO las `accepted` — preserva trazabilidad).
  Devuelve 204.

- **AC-6**: `GET /api/saas-billing/members` requiere auth y la
  misma acción. Lista todos los `profiles` de la org con sus roles.
  Devuelve 200 con
  `[{ id, email, displayName, role, createdAt }]`. **Incluye** al
  admin que creó la org (no lo filtra).

- **AC-7**: `PATCH /api/saas-billing/members/:id` requiere auth y
  `canManageOrgUsers`. Permite cambiar el `role` de un member
  (excepto el admin original, ver AC-8). Body: `{ role }`. Valida
  `role` ∈ `{gestor, propietario, inquilino}`. Devuelve 200 con el
  member actualizado.

- **AC-8**: `DELETE /api/saas-billing/members/:id` requiere auth y
  `canManageOrgUsers`. NO permite borrar al admin original
  (identificado como el `profile` con `role = 'admin'` y
  `created_by = organization.created_by`). Devuelve 409
  `code: CANNOT_REMOVE_ORG_OWNER` si se intenta.

### Email de invitación

- **AC-9**: Cuando se crea una invitación, el server envía 1 email
  usando `nodemailer` (ya instalado). El email tiene:
  - From: el `emailConfig.from` configurado (multi-buzón Fase 7).
  - To: `invitation.email`.
  - Subject: `"{inviterName} te invitó a {organizationName} en InmoControl"`.
  - Body (HTML + texto plano): incluye el `acceptUrl`, el nombre
    del invitador, el nombre de la org, el rol asignado, y la fecha
    de expiración.
  - Reply-To: el email del invitador (si está disponible, sino el
    `emailConfig.from`).
- **AC-10**: Si el envío de email **falla** (SMTP caído, credenciales
  inválidas, etc.), el endpoint **igual devuelve 201** con la
  invitación creada, pero agrega `warning: "EMAIL_FAILED"` y loguea
  el error en consola. La invitación sigue siendo usable (el admin
  puede copiar el `acceptUrl` del log o reenviarlo manualmente).
  **No es bloqueante** — la UX no debería romperse porque el mail
  no salió.

### Validación de quota por plan

- **AC-11**: Antes de crear una invitación (AC-3), el server cuenta
  los `profiles` de la org + las invitaciones `pending` no expiradas
  y compara con `saas_plans.max_users` del plan activo. Si la suma
  alcanza el límite → 402 `code: PLAN_LIMIT_REACHED` (ver AC-3).
- **AC-12**: El plan `trial` tiene `max_users = 2` (ya está en el
  auto-seed de `saas_signup.md` AC-15). Eso significa: 1 admin + 1
  invitado. El segundo intento de invitación devuelve 402.
- **AC-13**: Si el plan activo es `null` (org sin subscription),
  `max_users` se considera `1` (solo el admin) para no romper UX.

### Aislamiento multi-tenant

- **AC-14**: TODAS las queries de invitaciones y members filtran
  por `organization_id` del request autenticado. Un admin de Org A
  **NO puede** listar/crear/borrar invitaciones de Org B. Verificar
  con el mismo patrón del verifier `saas_multitenant.md`.
- **AC-15**: El email de un invitado es único **por org**, no
  global. Dos orgs distintas pueden invitar al mismo email
  (ej: una persona que es gestor en 2 agencias). El check de
  duplicado es `WHERE email = ? AND organization_id = ?`.

### UI

- **AC-16**: En `Configuración → Equipo` (tab nueva en
  `SettingsView.tsx`), el admin ve:
  - Tabla de `members` (los que ya aceptaron) con columnas:
    Email, Nombre, Rol, Creado, Acciones (cambiar rol, eliminar).
  - Tabla de `invitations` con columnas: Email, Rol, Estado
    (pendiente/aceptada/expirada con chip de color), Creada,
    Expira, Acciones (reenviar mail, eliminar).
  - Botón `+ Invitar miembro` arriba a la derecha. Abre un modal
    con form: `email` + `select role ∈ {gestor, propietario,
inquilino}`.
  - Banner arriba si la org está al límite de `max_users`:
    `"🔒 Plan {planName} permite {N} usuarios. Actualizá tu plan
para invitar más."` con link a `SaasBillingView`.
- **AC-17**: El modal de "Invitar" muestra **toast de éxito**:
  `"✓ Invitación enviada a {email}. Tienen 7 días para aceptarla."`
  Si el server devuelve `warning: EMAIL_FAILED`, muestra **toast
  warning**: `"⚠ La invitación se creó pero el email no se envió.
El link se logueó en el server. Reintentá más tarde."`
- **AC-18**: La página de aceptación (ruta nueva `/accept-invitation`)
  es **pública** (no requiere sesión). Muestra:
  - Header con logo InmoControl.
  - Card con: "Te invitaron a {organizationName} como {role}".
  - Form con `displayName` (opcional, default = email local) y
    `password` (requerido, con indicador de fortaleza).
  - Botón "Aceptar invitación y entrar".
  - Si la invitación ya fue aceptada → mensaje "Esta invitación
    ya fue aceptada. Iniciá sesión." + link a login.
  - Si expiró → "Esta invitación expiró. Pedile al admin de
    {organizationName} que te reenvíe una nueva." + link a signup.
  - Si el token no existe → "Invitación no encontrada. Verificá
    el link." + link a signup.

## 3. Edge Cases (qué pasa si...)

### Error States

- **EC-1**: Email con formato inválido al invitar. → 400
  `code: INVALID_EMAIL` (mismo helper que signup).
- **EC-2**: Rol inválido (`role: "superadmin"`). → 400
  `code: INVALID_ROLE`.
- **EC-3**: Email ya existe en la org. → 409 `code: EMAIL_ALREADY_MEMBER`
  con mensaje: `"{email} ya es miembro de {organizationName}."`.
- **EC-4**: Org llegó al límite de usuarios. → 402
  `code: PLAN_LIMIT_REACHED` (ver AC-3).
- **EC-5**: SMTP caído al enviar el mail. → 201 con `warning:
EMAIL_FAILED`. La invitación queda creada. El admin ve el
  warning y puede reenviar manualmente (AC-10).
- **EC-6**: Token de aceptación malformado (no es hex de 64 chars).
  → 404 `code: INVITATION_NOT_FOUND`.
- **EC-7**: Token válido pero expirado. → 404
  `code: INVITATION_EXPIRED` (sutil: el cliente puede mostrar
  copy distinto al de "no encontrada").
- **EC-8**: Token válido pero ya aceptado. → 404
  `code: INVITATION_ALREADY_ACCEPTED` con link a login.
- **EC-9**: Intentar borrar al admin original. → 409
  `code: CANNOT_REMOVE_ORG_OWNER`.
- **EC-10**: MySQL cae durante el INSERT de la invitación. → 500
  JSON `code: DB_UNAVAILABLE`. NO se crea la invitación.

### Empty States

- **EC-11**: Org sin invitaciones pendientes. La tabla muestra
  empty state: "No hay invitaciones pendientes. Click 'Invitar
  miembro' para agregar a alguien."
- **EC-12**: Org sin members (caso edge post-signup, antes de
  invitar a nadie). La tabla muestra solo al admin original.

### Loading States

- **EC-13**: Durante el POST de invitación → modal abierto con
  spinner + "Enviando invitación…". El botón se deshabilita.
- **EC-14**: Durante la aceptación (POST `/accept`) → spinner +
  "Creando tu cuenta…". NO cerrar el modal antes de la respuesta
  (anti-pattern visto en `fix-issue-tenant-modal`).

### Edge Cases del flujo

- **EC-15**: El invitado abre el link de aceptación pero YA tiene
  sesión activa de OTRA org. El server rechaza con 409
  `code: ALREADY_AUTHENTICATED_OTHER_ORG` y la UI muestra
  "Cerrá sesión de {otherOrgName} antes de aceptar esta invitación."
- **EC-16**: El invitado acepta, se loguea, y queda en la nueva org.
  Si después quiere volver a la org anterior, tiene que pedirle al
  admin de esa org que lo invite de nuevo (NO hay UI de "cambiar
  de org" en v1 — es out of scope).
- **EC-17**: El admin quiere reenviar el mail de una invitación
  `pending`. Botón "Reenviar mail" llama a
  `POST /api/saas-billing/invitations/:id/resend` que regenera
  el token y el `expires_at` (+7 días desde ahora) y vuelve a
  mandar el mail. Si falla el mail → mismo warning que AC-10.

## 4. Technical Contract

### Endpoints

```typescript
// POST /api/saas-billing/invitations (auth + canManageOrgUsers)
interface CreateInvitationRequest {
  email: string; // "gestor@inmobiliaria.com"
  role: "gestor" | "propietario" | "inquilino";
}
interface CreateInvitationResponse {
  id: string; // UUID
  email: string;
  role: string;
  token: string; // hex 64 chars (para debugging / log)
  acceptUrl: string; // "https://inmocontrol.tecnowebsupportia.com/accept-invitation?token=..."
  expiresAt: string; // ISO 8601
  warning?: "EMAIL_FAILED"; // presente solo si el SMTP falló
}

// GET /api/saas-billing/invitations (auth + canManageOrgUsers)
interface ListInvitationsResponse {
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    status: "pending" | "accepted" | "expired";
    createdAt: string;
    expiresAt: string;
    acceptedAt: string | null;
  }>;
}

// GET /api/saas-billing/invitations/:token (PUBLICO)
interface GetInvitationResponse {
  email: string;
  organizationName: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
}

// POST /api/saas-billing/invitations/:token/accept (PUBLICO)
interface AcceptInvitationRequest {
  password: string; // ≥8 chars, 1 letra, 1 número (mismo que signup)
  displayName?: string; // opcional, default = parte local del email
}
interface AcceptInvitationResponse {
  user: { id; email; displayName; role; organizationId };
  organization: { id; name };
  warning?: "AUTO_LOGIN_FAILED"; // si por algún motivo la cookie no se pudo setear
}

// GET /api/saas-billing/members (auth + canManageOrgUsers)
interface ListMembersResponse {
  members: Array<{
    id: string;
    email: string;
    displayName: string;
    role: "admin" | "gestor" | "propietario" | "inquilino";
    createdAt: string;
    isOrgOwner: boolean; // true si role='admin' && created_by=org.created_by
  }>;
}

// PATCH /api/saas-billing/members/:id (auth + canManageOrgUsers)
interface UpdateMemberRequest {
  role: "gestor" | "propietario" | "inquilino";
}
interface UpdateMemberResponse {
  id;
  email;
  role;
  updatedAt;
}

// DELETE /api/saas-billing/members/:id (auth + canManageOrgUsers)
// → 204 No Content. 409 CANNOT_REMOVE_ORG_OWNER si es el admin original.

// POST /api/saas-billing/invitations/:id/resend (auth + canManageOrgUsers)
interface ResendInvitationResponse {
  acceptUrl: string; // nuevo token + nueva expiración
  expiresAt: string;
  warning?: "EMAIL_FAILED";
}
```

### Schema

```sql
-- Migración nueva: db/mysql/migrations/016_org_invitations.sql

CREATE TABLE IF NOT EXISTS org_invitations (
  id              CHAR(36)     NOT NULL,
  organization_id CHAR(36)     NOT NULL,
  email           VARCHAR(150) NOT NULL,
  role            VARCHAR(20)  NOT NULL,
  token           VARCHAR(64)  NOT NULL,
  invited_by      CHAR(36)     NOT NULL,  -- profile.id del admin
  expires_at      DATETIME     NOT NULL,
  accepted_at     DATETIME     NULL,
  created_by      VARCHAR(150) NOT NULL,  -- email del admin (legacy compat)
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY org_invitations_token_idx (token),
  KEY org_invitations_org_idx (organization_id),
  KEY org_invitations_email_idx (email),
  CONSTRAINT fk_org_invitations_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_invitations_invited_by
    FOREIGN KEY (invited_by) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT chk_org_invitations_role
    CHECK (role IN ('gestor', 'propietario', 'inquilino'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Componentes del cliente

```typescript
// src/features/settings/TeamTab.tsx (nuevo)
interface TeamTabProps {
  organizationId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}

// src/features/settings/AcceptInvitationPage.tsx (nuevo, ruta pública)
interface AcceptInvitationPageProps {
  token: string; // viene del query string
}

// src/features/settings/InviteMemberModal.tsx (nuevo)
interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvited: (invitation: Invitation) => void; // agrega a la tabla
  showToast: (msg: string, type?: ...) => void;
}
```

### Estados a trackear

- `members: Member[]` — fetched al montar TeamTab
- `invitations: Invitation[]` — fetched al montar TeamTab
- `loading: boolean` — para el estado del botón "Invitar"
- `isAtLimit: boolean` — derivado de `members.length + pendingInvitations >= maxUsers`
- `planName: string` — para mostrar el banner de límite

### Permisos nuevos (en `server/lib/permissions.ts`)

```typescript
export type Action =
  | ... // los existentes
  | 'canManageOrgUsers'    // nuevo
  | 'canInviteUsers'       // nuevo (alias semántico de canManageOrgUsers en v1)
  | 'canChangeMemberRole'  // nuevo (subset de canManageOrgUsers)
  ;

// admin: todas en true (incluyendo las nuevas)
// gestor: false (no puede invitar)
// propietario: false
// inquilino: false
```

**Sincronizar con `src/features/auth/permissions.ts`** (el test de
drift `tests/permissions-matrix.test.ts` valida que coincidan).

## 5. Timeouts (explícitos)

- **SMTP send**: timeout de **10s** vía `nodemailer` (si el server
  SMTP cuelga, la invitación se crea igual con `warning: EMAIL_FAILED`
  — ver AC-10).
- **Token lookup**: el `GET /api/saas-billing/invitations/:token`
  responde en <500ms (es un SELECT indexado por `token` UNIQUE).
- **Accept**: el `POST /accept` tiene timeout interno de **5s** para
  bcrypt (10 rounds, ~250ms normal). Si bcrypt se cuelga, devolver
  500 `code: HASH_TIMEOUT`.

## 6. Tostadas exactas (copy approved)

| Trigger                        | Tipo    | Copy exacto                                                                                                    |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| Invitar éxito                  | success | "✓ Invitación enviada a {email}. Tienen 7 días para aceptarla."                                                |
| Invitar éxito + email failed   | warning | "⚠ La invitación se creó pero el email no se envió. El link está en los logs del server. Reintentá más tarde." |
| Plan limit reached             | error   | "🔒 Llegaste al límite de {N} usuarios de tu plan {planName}. Actualizá tu plan para invitar más."             |
| Email ya es miembro            | error   | "{email} ya es miembro de {organizationName}."                                                                 |
| Aceptar éxito                  | success | "✓ ¡Bienvenido a {organizationName}! Tu cuenta está activa."                                                   |
| Aceptar con token expirado     | error   | "Esta invitación expiró. Pedile al admin de {organizationName} que te reenvíe una nueva."                      |
| Aceptar con sesión de otra org | error   | "Cerrá sesión de {otherOrgName} antes de aceptar esta invitación."                                             |
| Eliminar member éxito          | success | "✓ {email} fue removido de la organización."                                                                   |
| Eliminar admin original        | error   | "🔒 No podés eliminar al dueño de la organización."                                                            |
| Cambiar rol éxito              | success | "✓ Rol de {email} actualizado a {newRole}."                                                                    |

## 7. Dependencias

### Archivos a crear

- `db/mysql/migrations/016_org_invitations.sql` (schema)
- `scripts/apply-016-migration.mjs` (applier idempotente)
- `src/features/settings/TeamTab.tsx`
- `src/features/settings/InviteMemberModal.tsx`
- `src/features/settings/AcceptInvitationPage.tsx`
- `src/lib/invitations/emailTemplates.ts` (HTML + texto)
- `src/lib/api/invitations.ts` (cliente tipado)
- `tests/verifiers/saas_user_mgmt.md`
- `scripts/verifier-saas-user-mgmt.ps1`

### Archivos a modificar

- `server/routes/saasBilling.ts` (5 nuevos endpoints)
- `server/lib/permissions.ts` (3 acciones nuevas)
- `src/features/auth/permissions.ts` (sync con la matriz)
- `src/features/settings/SettingsView.tsx` (tab "Equipo" nueva)
- `src/App.tsx` (ruta pública `/accept-invitation`)
- `tests/permissions-matrix.test.ts` (verificar que no rompe drift)

### Archivos a NO tocar

- `src/features/properties/` (no relacionado)
- `src/features/billing/` (no relacionado)
- `src/features/financial/` (no relacionado)
- `src/features/contracts/` (no relacionado)
- `src/features/tenants/` (no relacionado)

## 8. Out of Scope

- **SSO (Google, Microsoft login)**: el invitado se loguea con email
  - password. SSO es para una fase futura.
- **Roles custom por org**: solo los 3 hardcodeados
  (`gestor`, `propietario`, `inquilino`). Un sistema de roles
  configurables es out of scope.
- **Reasignación de propiedades/tenants cuando un user sale**: si
  un gestor se va de la org, sus registros siguen con su `created_by`
  histórico. No se migran datos a otro user.
- **Bulk invite (CSV)**: solo invitación individual. Importar
  20 usuarios de una es para una fase futura.
- **Remover al admin original de la org**: ese user es la raíz de
  la org. Para "transferir ownership" hay que hacerlo a nivel DB
  (tocar `organizations.created_by`) y se hace manualmente, no desde
  la UI.
- **UI de "cambiar de org"** (EC-16): un user puede ser invitado a
  múltiples orgs pero tiene que hacer logout/login manual. No hay
  switcher en v1.

## 9. Riesgos identificados

- **Email deliverability**: nodemailer con SMTP genérico (Gmail,
  SendGrid) tiene riesgo de caer en spam. Mitigación: configurar
  SPF/DKIM en el dominio (out of scope de este spec; es config de
  infra).
- **Quota drift**: si la org tiene 1 admin + 1 invitación pendiente
  y el plan dice `max_users=2`, el siguiente intento da 402. Pero
  si la invitación se BORRA sin aceptarse, la org vuelve a tener
  1 user real + 0 pending = puede invitar otro. Eso es correcto.
- **Token storage**: el `token` se guarda en plaintext en la DB
  (necesario para lookup). Si la DB se filtra, alguien podría
  aceptar invitaciones pendientes. Mitigación: el `expires_at` de
  7 días limita la ventana.
- **Email enumeration attack**: si el endpoint de aceptación
  devuelve "invitación no encontrada" vs "ya aceptada" vs
  "expirada", un atacante podría enumerar qué emails tienen
  invitaciones. Mitigación: usar el mismo mensaje genérico "Esta
  invitación no es válida" para los 3 casos de 404 (el cliente
  puede inferir por el contexto de la UI: si llegó por mail,
  probablemente es una de las 3, no es crítico).

## 10. Approval

**Status:** ⏳ Pending Review

**Aprobado por:** [nombre del user]

**Fecha de aprobación:** [YYYY-MM-DD]
