# Feature: Multi-Tenant Real (Aislamiento por organización)

> **Karpathy Spec** — Septiembre 2026. Define el aislamiento correcto de
> datos por organización en InmoControl. NO incluye código de implementación.
> Una vez aprobado, sigue `tests/verifiers/saas_multitenant.md`.

## 0. Contexto (por qué este spec existe)

InmoControl es un SaaS multi-tenant en Colombia. Cada agencia
(inmobiliaria) es una **organización** y sus datos NO deben filtrarse a
otras organizaciones. Hoy el código tiene **los cimientos** del
multi-tenant (columna `organization_id` en casi todas las tablas,
sesiones con `req.user.organizationId`, helpers como `ensureDefaultOrg()`)
pero **NO está conectado**:

- `ensureDefaultOrg()` devuelve siempre la primera org de la DB
  (un solo org activo en la práctica).
- Las queries que validan `organization_id` comparan contra el
  `ensureDefaultOrg()` actual, no contra el `req.user.organizationId`.
- **Resultado**: si un usuario de Org A conoce un `propertyId` de Org B,
  puede leerlo/modificarlo. **IDOR cross-tenant crítico**.

Este spec cierra esa brecha sin cambiar UX ni romper compat con el
piloto single-tenant actual.

## 1. User Story

**As a** agencia inmobiliaria cliente de InmoControl (Org A),
**I want to** que mis datos (propiedades, inquilinos, contratos, billing)
estén completamente aislados de los datos de Org B,
**So that** no haya riesgo de fuga de información entre clientes del SaaS
Y la app pueda escalar a múltiples agencias sin re-arquitectura mayor.

## 2. Acceptance Criteria (numerados, binarios)

### Aislamiento en lectura

- **AC-1**: `GET /api/properties` devuelve SOLO las propiedades donde
  `properties.organization_id = req.user.organizationId`. Una propiedad
  de otra org NUNCA aparece en el listado, ni siquiera si su UUID está
  hardcodeado en el request.
- **AC-2**: `GET /api/properties/:id` devuelve 404 (NO 200 ni 403) si
  la propiedad existe pero pertenece a otra org. El response es
  `{"error":"No se encontró la propiedad con id=X","code":"PROPERTY_NOT_FOUND"}`.
- **AC-3**: `GET /api/tenants` y `GET /api/tenants/:id` aplican el mismo
  filtro que AC-1/AC-2.
- **AC-4**: `GET /api/contracts` y `GET /api/contracts/:id` aplican el
  mismo filtro (vía `entities.ts`).
- **AC-5**: `GET /api/billing/policies/:propertyId` devuelve 404 si la
  propiedad existe pero pertenece a otra org. Mismo mensaje que AC-2.
- **AC-6**: `GET /api/financial-records` y `GET /api/inventories`
  filtran por org vía la FK transitiva (`property_id → organization_id`).

### Aislamiento en escritura

- **AC-7**: `POST /api/properties` SIN `organizationId` en el body usa
  `req.user.organizationId` automáticamente. Si el body TRAE
  `organizationId` y NO coincide con `req.user.organizationId`, el server
  rechaza con **403 FORBIDDEN** (no 200, no 400). Mensaje: `"No podés crear
recursos en otra organización"`.
- **AC-8**: `POST /api/tenants` y `POST /api/contracts` aplican la
  misma regla que AC-7.
- **AC-9**: `PATCH /api/entities/contracts/:id` valida que el contract
  pertenece a `req.user.organizationId` antes de aplicar cambios. Si
  no → 404 con el mismo mensaje que AC-2.
- **AC-10**: `PUT /api/billing/policies/:propertyId` valida que la
  propiedad pertenece a `req.user.organizationId`. Si no → 404.
- **AC-11**: `DELETE /api/properties/:id` valida org. Devuelve 404 si
  la propiedad es de otra org (en vez de 403, para no filtrar
  existencia).

### Aislamiento de los helpers actuales

- **AC-12**: `ensureDefaultOrg()` deja de ser la fuente de verdad para
  `orgId` en requests autenticados. La nueva función
  `getOrgIdForRequest(req)` (ver §4) reemplaza el uso en TODOS los
  routers. `ensureDefaultOrg()` se mantiene SOLO para el bootstrap
  inicial del seed (donde no hay sesión) y para tests.
- **AC-13**: `requireAuth` agrega el campo `organizationId` al
  `req.user` (ya existe, ver `auth.ts:90`), y rechaza con 401 si una
  sesión válida NO tiene `organizationId` (caso edge: sesiones legacy
  del seed). Esto fuerza a los tenants a re-loguearse después del
  deploy.

### Compatibilidad con el piloto

- **AC-14**: El seed inicial (`scripts/seed-pilot.mjs` + el endpoint
  `POST /api/admin/seed`) sigue creando la org `InmoControl Default`
  con un admin user. Las sesiones existentes que apunten a esa org
  siguen funcionando. Cero regresión.
- **AC-15**: Los tests E2E existentes (`tests/verifiers/wizard_*.md`)
  siguen pasando contra el piloto. La cookie del seed (`admin@inmocontrol.local`)
  sigue dando acceso a todas las entidades del seed.

## 3. Edge Cases (qué pasa si...)

### Error States

- **EC-1**: Sesión sin `organizationId` (sesión legacy pre-fix).
  → 401 con `{"error":"Sesión inválida","code":"SESSION_MISSING_ORG"}`.
  El frontend fuerza re-login.
- **EC-2**: Body trae `organizationId` que coincide con `req.user.organizationId`
  pero es explícitamente diferente (caso info-leak del cliente).
  → 200 OK (lo aceptamos, no rompemos la API pública).
- **EC-3**: Race condition: el `organizationId` del user cambia
  mid-session (caso raro: admin cambia la org de un usuario). El
  request siguiente usa el `organizationId` actualizado, no el viejo.
  → Comportamiento correcto por construcción.
- **EC-4**: Query con `WHERE organization_id = NULL` (datos huérfanos
  del piloto pre-multi-tenant). El server los devuelve en el listado
  del admin user del seed (compat con AC-14), pero un usuario de otra
  org NUNCA los ve.
- **EC-5**: DB drift: una fila de una tabla nueva no tiene
  `organization_id` porque la migración no se aplicó. El SELECT
  devuelve esa fila solo al admin del seed. Para otras orgs, se
  filtra con `WHERE organization_id = ? OR organization_id IS NULL`
  con un log de warning si hay nulls.

### Empty States

- **EC-6**: Una org sin properties. `GET /api/properties` devuelve
  `[]` (no 404). Lo mismo para tenants, contracts, etc.
- **EC-7**: Una org sin `BillingPolicy` para una propiedad. El
  BillingPanel muestra el banner ámbar existente (no cambia).

### Loading States

- **EC-8**: El middleware de org-id agrega <1ms por request (un SELECT
  indexado por PK). No afecta el UX.

## 4. Technical Contract

### Helper nuevo (reemplaza `ensureDefaultOrg()`)

```typescript
// server/lib/orgContext.ts (archivo nuevo)
import { Request } from "express";
import pool from "../db.js";

interface OrgContext {
  orgId: string;
  isAdmin: boolean; // true si el user es el admin del seed
  isLegacySession: boolean; // true si la sesión es del piloto pre-multi-tenant
}

/**
 * Resuelve el organizationId del request actual.
 * Prioridad:
 *   1. req.user.organizationId (de la sesión httpOnly)
 *   2. ensureDefaultOrg() (fallback para bootstrap, tests, admin seed)
 *
 * Nunca lanza. Devuelve { orgId, isAdmin, isLegacySession }.
 *
 * - isAdmin=true solo si req.user.role === 'admin' Y req.user.id ===
 *   el admin user del seed (ID_PROFILE_ADMIN = "00000000-0000-0000-0000-000000000005").
 * - isLegacySession=true si la sesión existe pero req.user.organizationId
 *   es null (caso de sesiones creadas antes del fix).
 */
export async function getOrgIdForRequest(req: Request): Promise<OrgContext> {
  const user = (req as any).user;
  if (user?.organizationId) {
    const isAdmin =
      user.role === "admin" &&
      user.id === "00000000-0000-0000-0000-000000000005";
    return {
      orgId: user.organizationId,
      isAdmin,
      isLegacySession: false,
    };
  }

  // Fallback: bootstrap / test / admin seed sin sesión.
  // Devuelve la org default. NO usar en producción para queries de user data.
  const orgId = await ensureDefaultOrg();
  return {
    orgId,
    isAdmin: true, // treat as admin in fallback
    isLegacySession: !!user, // hay user pero sin orgId
  };
}
```

### Cambio en `requireAuth` (auth.ts)

```typescript
// server/routes/auth.ts (modificar la función actual)
// Después de validar la sesión y antes del next():
if (!(req as any).user.organizationId) {
  return res.status(401).json({
    error: "Sesión inválida",
    code: "SESSION_MISSING_ORG",
  });
}
```

### Cambio en cada router (patrón de migración)

```typescript
// ANTES (en todos los routers):
const orgId = await ensureDefaultOrg();

// DESPUÉS:
const { orgId } = await getOrgIdForRequest(req);
```

Y en cada query que valida org, usar el `orgId` del request, no el
del `ensureDefaultOrg()`. Ejemplo:

```typescript
// server/routes/properties.ts:GET /:id (línea ~290)
const [rows] = await pool.query(
  `SELECT * FROM properties
    WHERE id = ? AND organization_id = ?     ← ESTE ? es req.user.organizationId
    LIMIT 1`,
  [propertyId, orgId],
);
if (rows.length === 0) {
  res.status(404).json({
    error: `No se encontró la propiedad con id=${propertyId}.`,
    code: "PROPERTY_NOT_FOUND",
  });
  return;
}
```

### Cambios específicos en routers (checklist exhaustivo)

| Router                      | Endpoints a tocar                                                                                                                                               | Validar `req.user.organizationId` |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `properties.ts`             | GET /, GET /:id, POST /, PATCH /:id, DELETE /:id, POST /:id/documents                                                                                           | sí                                |
| `tenants.ts`                | GET /, GET /:id, POST /, PATCH /:id, DELETE /:id, POST /:id/upload-document, POST /:id/upload-acta                                                              | sí                                |
| `entities.ts` (contracts)   | GET /contracts, GET /contracts/:id, POST /contracts, PATCH /contracts/:id                                                                                       | sí                                |
| `billing.ts`                | GET /policies/:propertyId, PUT /policies/:propertyId, POST /amortization/generate, GET /amortization/:contractId, POST /invoices/\*, GET /owner-statement, etc. | sí                                |
| `financialRecords.ts`       | GET /, POST /, PATCH /:id, DELETE /:id                                                                                                                          | sí (vía property FK)              |
| `inventories.ts`            | GET /, POST /, POST /upload-pdf, POST /upload-photos                                                                                                            | sí (vía property FK)              |
| `googleAuth.ts` (Drive ops) | /drive/file?fileId, /drive/folder?folderId                                                                                                                      | sí (vía parent folder)            |
| `saasBilling.ts`            | TODOS (planes, subs, payment methods, invoices)                                                                                                                 | sí                                |
| `notifications.ts`          | POST /send-email, POST /send-whatsapp                                                                                                                           | sí                                |

### Estados a trackear

- `req.user.organizationId` — agregarlo como campo requerido (ya existe, solo validar).
- `req.user.isAdmin` (opcional, derivado en `getOrgIdForRequest`).
- **No hay cambios en Zustand** del frontend. El cliente no necesita
  saber de orgs.

## 5. Timeouts

- **Server**: el SELECT de `ensureDefaultOrg` ya es <1ms (índice PK).
  `getOrgIdForRequest` agrega un nivel de indirección (1 lookup en
  memoria) → sigue siendo <1ms total.
- **Client**: sin cambios. El cliente no ve este fix.

## 6. Tostadas exactas (copy approved)

Este spec **NO agrega toasts nuevos**. El fix es transparente para el
usuario. Si en el futuro un cliente intenta acceder a un recurso de
otra org, verá 404 (no toast).

## 7. Dependencias

### Archivos a modificar

- `server/lib/orgContext.ts` (NUEVO) — `getOrgIdForRequest`
- `server/routes/auth.ts` — `requireAuth` rechaza sesiones sin orgId
- `server/routes/properties.ts` — 5 endpoints
- `server/routes/tenants.ts` — 7 endpoints
- `server/routes/entities.ts` — 4 endpoints (contracts)
- `server/routes/billing.ts` — 8 endpoints
- `server/routes/financialRecords.ts` — 4 endpoints
- `server/routes/inventories.ts` — 4 endpoints
- `server/routes/googleAuth.ts` — 2 endpoints (Drive proxy)
- `server/routes/saasBilling.ts` — 11 endpoints
- `server/routes/notifications.ts` — 2 endpoints

### Archivos a NO tocar (out of scope explícito)

- Cualquier componente React del frontend. El fix es 100% backend.
- `scripts/seed-pilot.mjs` — sigue creando la org default.
- `server/db.ts` — `ensureDefaultOrg` se mantiene (lo usa el seed).
- `AGENTS.md` — no necesita actualización (no cambia la convención).

## 8. Out of Scope

- **Sign-up público** (spec separado: `saas_signup.md`).
- **Panel de super-admin** (spec: `saas_admin_panel.md`).
- **Gestión de usuarios por org** (spec: `saas_user_mgmt.md`).
- **Multi-region / data residency** (futuro, no en este roadmap).
- **Audit log de accesos cross-tenant** (futuro, no en este roadmap).

## 9. Riesgos identificados

- **R1 (alto)**: Tests existentes del piloto asumen que la org default
  tiene acceso a todo. Si el fix filtra demasiado, los tests
  fallan. **Mitigación**: el seed se ejecuta con `isAdmin=true`, que
  sigue viendo TODO (incluso rows con `organization_id = NULL`).
- **R2 (medio)**: Hay queries que hacen JOIN implícito (ej: `invoices`
  vía `property_id`). Si la tabla intermedia no tiene `organization_id`,
  el filtro no se puede aplicar directo. **Mitigación**: el spec
  documenta el patrón "JOIN transitivo" y los routers usan
  sub-selects o `IN (...)` para mantener el aislamiento.
- **R3 (bajo)**: El middleware agrega <1ms por request. El pool MySQL
  tiene `connectionLimit=10`. En producción con N>100 RPS, podría
  haber presión adicional. **Mitigación**: el helper es O(1), no
  agrega queries nuevas. Medir en staging antes de prod.
- **R4 (bajo)**: Si alguien tiene una cookie válida pre-fix y la usa
  post-fix, recibe 401 (`SESSION_MISSING_ORG`). **Mitigación**: el
  toast del frontend puede aclarar "Por favor volvé a iniciar sesión".
  Out of scope para este spec (cambio de copy menor).

## 10. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]
