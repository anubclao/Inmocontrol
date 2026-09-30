# Feature: Sign-up Público de Organizaciones (Self-Service)

> **Karpathy Spec** — Septiembre 2026. Define el flujo de registro
> self-service de nuevas agencias en InmoControl. NO incluye código de
> implementación. Una vez aprobado, sigue `tests/verifiers/saas_signup.md`.

## 0. Contexto (por qué este spec existe)

InmoControl es un SaaS multi-tenant. Hoy el único camino para crear
una organización es ejecutar `scripts/seed-pilot.mjs` (vía SSH o
`POST /api/admin/seed` con un `X-Admin-Seed-Token`). Eso **no escala**:
un visitante anónimo que quiere probar el producto no puede crear
cuenta sin pedirle el token al admin.

Este spec agrega un **endpoint público de sign-up** que crea:

1. Una `organization` nueva.
2. Un `profile` admin (dueño de la org) con email/password.
3. Una `saas_subscription` con plan trial de 14 días.
4. Devuelve la cookie de sesión httpOnly.

Después del sign-up, el usuario puede usar la app completa. **No
necesita un admin del seed para activarlo**.

> **Dependencia**: este spec asume que `saas_multitenant.md` ya está
> implementado (sin multi-tenant real, el sign-up no tiene sentido
> porque no se puede aislar al nuevo usuario).

## 1. User Story

**As a** visitante anónimo (dueño de una inmobiliaria en Colombia),
**I want to** registrarme con email + password + nombre de mi agencia,
**So that** pueda probar InmoControl sin pedirle un token al admin Y
mi organización quede completamente aislada de las demás Y tenga
14 días de trial automático para evaluar el producto.

## 2. Acceptance Criteria (numerados, binarios)

### Endpoint público

- **AC-1**: `POST /api/saas-billing/signup` existe, NO requiere auth,
  acepta CORS, y crea una org + admin profile + subscription trial.
  Retorna 200 con `Set-Cookie: inmocontrol_pilot_session=...` y
  body JSON con `user`, `organization`, `subscription`.
- **AC-2**: El endpoint es **rate-limited**: 5 intentos por IP cada
  15 minutos (mismo `rateLimit` helper que `/api/auth/login`).
- **AC-3**: El endpoint valida con top-level try/catch y devuelve JSON
  en todos los casos de error (consistente con el spec general del
  proyecto, ver `wizard_property.md` AC-6).

### Validación de inputs

- **AC-4**: Campos requeridos: `email`, `password`, `organizationName`.
  Si falta alguno → **400 MISSING_REQUIRED_FIELDS**.
- **AC-5**: `email` debe ser RFC-5322 válido. Si no → **400 INVALID_EMAIL**
  con mensaje: `"El email no tiene formato válido"`.
- **AC-6**: `password` debe tener mínimo 8 caracteres, al menos 1 letra
  y 1 número. Si no → **400 WEAK_PASSWORD** con mensaje que liste los
  requisitos.
- **AC-7**: `organizationName` debe tener entre 3 y 100 chars. Si no →
  **400 INVALID_ORG_NAME**.
- **AC-8**: `email` debe ser único en la tabla `profiles`. Si ya existe
  → **409 EMAIL_TAKEN** con mensaje: `"Ya existe una cuenta con ese
email. ¿Olvidaste tu contraseña?"`.

### Creación de la organización

- **AC-9**: La org se crea con `id = crypto.randomUUID()`,
  `name = organizationName.trim()`, `created_by = email`.
- **AC-10**: El `profile` admin se crea con:
  - `id = crypto.randomUUID()`
  - `organization_id = orgId` (de la org recién creada)
  - `email = email.toLowerCase().trim()`
  - `password_hash = bcrypt.hash(password, 10)`
  - `display_name = organizationName` (o el input que agreguemos si
    se separa nombre personal del nombre de la org — fuera de scope)
  - `role = 'admin'`
  - `created_by = email`
- **AC-11**: La `saas_subscription` se crea con:
  - `id = crypto.randomUUID()`
  - `organization_id = orgId`
  - `plan_id = (SELECT id FROM saas_plans WHERE slug = 'trial')` (o
    un plan default "Trial 14 días" que se seedea si no existe)
  - `status = 'trialing'`
  - `trial_ends_at = NOW() + INTERVAL 14 DAY`
  - `current_period_start = NOW()`
  - `current_period_end = NOW() + INTERVAL 14 DAY`
  - `created_by = email`

### Sesión y respuesta

- **AC-12**: El server crea una sesión en memoria con el `profileId`
  y `organizationId` del nuevo admin, setea la cookie httpOnly
  `inmocontrol_pilot_session`, y la devuelve en el response.
- **AC-13**: El response 200 incluye:
  ```json
  {
    "user": { "id", "email", "displayName", "role", "organizationId" },
    "organization": { "id", "name" },
    "subscription": { "id", "planId", "status", "trialEndsAt" }
  }
  ```

### Email de bienvenida (out of scope para v1)

- **AC-14**: v1 NO envía email de bienvenida. Solo el trial en la app.
  (Si en el futuro se enchufa `nodemailer`, agregar un email de
  bienvenida con magic-link de verificación — out of scope.)

### Plan Trial y billing

- **AC-15**: El plan "Trial" se auto-seedea si no existe. Slug: `trial`,
  nombre: "Trial 14 días", `price_cop = 0`, `max_properties = 5`,
  `max_users = 2`, `max_alerts_per_month = 50`, `is_active = true`.
  Verificación: si el `INSERT IGNORE` no afecta filas, el plan ya
  existía. **No rompe si se ejecuta 2 veces** (idempotente).
- **AC-16**: El trial expira a los 14 días. Después, el endpoint
  `/api/saas-billing/subscription` devuelve `status = 'trial_expired'`
  y el `SaasBillingView` muestra un banner pidiendo elegir plan
  pago. **El user puede seguir logueado y usando la app, pero no
  puede crear más propiedades** (validación contra `max_properties`).

### Onboarding post-signup

- **AC-17**: Después del sign-up exitoso, el frontend redirige a
  `/configuracion` (la pestaña de "Información de Agencia") con un
  toast de bienvenida: "✓ ¡Bienvenido a InmoControl! Tu trial de
  14 días está activo."
- **AC-18**: El nuevo admin puede inmediatamente crear una propiedad,
  un tenant, y un contrato. Todos los datos quedan en su org
  (`organization_id` correcto en cada INSERT).

## 3. Edge Cases (qué pasa si...)

### Error States

- **EC-1**: Email con mayúsculas (`Admin@Example.com`). El server hace
  `toLowerCase()` antes de validar. No debe crear duplicado con
  `admin@example.com`.
- **EC-2**: Email con espacios al final (`admin@x.com`). El server
  hace `.trim()` antes de validar.
- **EC-3**: Password de 7 chars. → 400 WEAK_PASSWORD. NO se crea la
  org (transaccional: si falla cualquier paso, rollback).
- **EC-4**: `organizationName` con caracteres especiales (`Inmobiliaria
"Los Pinos" S.A.S`). El server hace `trim()` pero NO valida XSS
  (es nombre, no HTML).
- **EC-5**: MySQL cae durante el INSERT. El server devuelve 500 JSON
  con `code: DB_UNAVAILABLE`. NO se crea org, profile ni subscription
  (transaccional).
- **EC-6**: El plan `trial` no existe y el seed automático falla (ej:
  tabla `saas_plans` no migrada). El server devuelve 500 con
  `code: NO_TRIAL_PLAN`. El signup no puede proceder.
- **EC-7**: Rate limit excedido (5 signups en 15 min desde la misma
  IP). El server devuelve 429 con `Retry-After` header.

### Empty States

- **EC-8**: `organizationName` con solo espacios. → 400 INVALID_ORG_NAME
  (después del trim queda vacío).
- **EC-9**: Email con formato válido pero dominio inexistente
  (`foo@estaempresanoexiste.com`). El server NO valida el dominio
  en v1 (sería un SMTP check que requiere un servicio externo).
  Out of scope: verificación de email via magic link.

### Edge Cases del flujo

- **EC-10**: User llena el form, click "Crear cuenta", pero su sesión
  de piloto está activa. El server **rechaza** el signup si ya hay
  sesión activa. Devuelve 409 con `code: ALREADY_AUTHENTICATED` y
  mensaje: `"Ya tenés una cuenta activa. Cerrá sesión primero."`.
- **EC-11**: User hace doble click en "Crear cuenta". El segundo click
  llega 50ms después. El server detecta el duplicado (mismo email,
  otro request) y el segundo devuelve 409. El primero termina OK.
- **EC-12**: User cierra el browser entre el click y la respuesta. La
  org, profile y subscription YA se crearon (transaccional). Cuando
  el user vuelve y se loguea, ve todo OK.

## 4. Technical Contract

### Endpoint

```typescript
// POST /api/saas-billing/signup
interface SignupRequest {
  email: string; // "admin@inmobiliaria.com"
  password: string; // "MiPass123!"
  organizationName: string; // "Inmobiliaria Los Pinos"
}

interface SignupResponse {
  user: {
    id: string; // UUID
    email: string;
    displayName: string;
    role: "admin";
    organizationId: string; // UUID
  };
  organization: {
    id: string;
    name: string;
  };
  subscription: {
    id: string;
    planId: string;
    status: "trialing";
    trialEndsAt: string; // ISO 8601
  };
}

// Set-Cookie: inmocontrol_pilot_session=<sessionId>; HttpOnly; SameSite=Lax
```

### Errores

```typescript
// 400 MISSING_REQUIRED_FIELDS
// 400 INVALID_EMAIL
// 400 WEAK_PASSWORD
// 400 INVALID_ORG_NAME
// 409 EMAIL_TAKEN
// 409 ALREADY_AUTHENTICATED
// 429 RATE_LIMIT_EXCEEDED
// 500 DB_UNAVAILABLE
// 500 NO_TRIAL_PLAN
```

### Componentes del cliente (props)

```typescript
// src/features/auth/SignupView.tsx (NUEVO)
interface SignupViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
}

// Estado interno:
// - form: { email, password, organizationName }
// - submitting: boolean
// - errors: { email?, password?, organizationName? }
```

### Estados a trackear

- En el frontend: un nuevo `SignupView` que NO usa Zustand (es
  pre-auth). Después del signup exitoso, el `useAuthStore` se hidrata
  con la respuesta.
- En el backend: la sesión se guarda en el `sessions` Map de
  `auth.ts` (mismo que el login).

### Esquema de DB requerido

**No requiere migración nueva** — todas las tablas (`organizations`,
`profiles`, `saas_subscriptions`, `saas_plans`) ya existen. El spec
usa el `id` UUID existente.

## 5. Timeouts

- **Server**: el endpoint usa 1 transacción MySQL (3 INSERTs) que
  debe completarse en <2s. No tiene llamadas a APIs externas (sin
  email de bienvenida en v1).
- **Client**: el fetch tiene `AbortController` de 15s. Si excede →
  toast "El servidor tardó demasiado. Reintentá en unos segundos."

## 6. Tostadas exactas (copy approved)

| Trigger           | Tipo    | Copy exacto                                                           |
| ----------------- | ------- | --------------------------------------------------------------------- |
| Signup exitoso    | success | "✓ ¡Bienvenido a InmoControl! Tu trial de 14 días está activo."       |
| Email duplicado   | error   | "Ya existe una cuenta con ese email. ¿Olvidaste tu contraseña?"       |
| Password débil    | error   | "La contraseña debe tener al menos 8 caracteres, 1 letra y 1 número." |
| Email inválido    | error   | "El email no tiene formato válido."                                   |
| Rate limit        | error   | "Demasiados intentos. Esperá 15 minutos y volvé a intentar."          |
| Error de servidor | error   | "Error creando la cuenta. Reintentá en unos minutos."                 |

## 7. Dependencias

### Archivos a modificar / crear

- `server/routes/saasBilling.ts` — agregar `POST /signup` ANTES del
  `router.use(requireAuth)` (porque es público).
- `src/features/auth/SignupView.tsx` (NUEVO) — form con email/password/orgName.
- `src/App.tsx` (shell) — agregar ruta `/signup` que renderiza SignupView.
- `src/features/auth/LoginView.tsx` (o equivalente) — agregar link
  "¿No tenés cuenta? Crear cuenta" que va a `/signup`.

### Archivos a NO tocar (out of scope explícito)

- `server/db.ts` — sin cambios.
- `server/routes/auth.ts` — sin cambios (signup NO usa el login, pero
  sí reutiliza el `sessions` Map y la función de cookie).
- `src/features/settings/SaasBillingView.tsx` — el trial ya se muestra
  si el plan es 'trial' (lógica existente, no se toca).
- Cualquier migración SQL (no hace falta).

## 8. Out of Scope

- **Verificación de email** vía magic link (requiere nodemailer + tokens).
- **OAuth signup** (Google, Microsoft) — futuro.
- **2FA** — futuro.
- **Custom domain** (`inmobiliaria.inmocontrol.app`) — futuro.
- **Migración de trials a pagos** automática — ya cubierto por
  `/api/saas-billing/invoices/:id/pay` (mock).
- **Panel de super-admin** para ver todos los signups (spec separado).
- **Gestión de usuarios por org** (spec separado).

## 9. Riesgos identificados

- **R1 (alto)**: El signup público sin CAPTCHA es un vector de spam.
  **Mitigación**: rate limit (AC-2). En el futuro, agregar hCaptcha.
- **R2 (medio)**: Si un atacante hace 5 signups por minuto, crea 5
  orgs vacías. **Mitigación**: la DB se llena de rows vacíos pero
  inofensivos. Un script de cron puede purgar orgs sin
  `properties` con `created_at < NOW() - 30 days`. Out of scope
  para v1.
- **R3 (bajo)**: El rate limit es por IP, no por dominio de email. Un
  atacante con IP rotativa puede crear N orgs. **Mitigación**: agregar
  rate limit por dominio de email en v2.
- **R4 (bajo)**: Si bcrypt con cost 10 tarda >2s en una VM lenta, el
  signup puede exceder el timeout. **Mitigación**: async bcrypt
  (Node nativo lo hace), medir en staging.

## 10. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]
