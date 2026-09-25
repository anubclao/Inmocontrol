# Feature: Validación de permisos por endpoint (no solo sesión)

> **Karpathy Spec** — 2026-08-03. **Issue crítico de seguridad abierto**:
> el backend solo valida que haya sesión (`requireAuth`), NO valida que
> el `role` del usuario tenga permiso para la acción. Un inquilino con
> curl puede bypassear la UI y crear una propiedad (ver `AUTH §4 EC-13`).
>
> Este spec define la solución: middleware `requireRole(action)` que
> valida `ROLE_PERMISSIONS[role][action]` server-side.

## 1. User Story

**As a** backend de InmoControl,
**I want to** validar que el `role` del usuario autenticado tenga permiso para la acción específica que está intentando (no solo que esté autenticado),
**So that** un usuario con `role=inquilino` no pueda bypassear la UI y crear/editar/eliminar recursos directamente vía curl, y un `role=propietario` no pueda borrar propiedades (que la UI le oculta pero el endpoint backend acepta).

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: Middleware `requireRole(action)` rechaza con 403 si el rol no tiene el permiso

- **Trigger**: request autenticada con `role=inquilino` a `POST /api/properties`.
- **Comportamiento**: el backend devuelve `403 { error: 'No tenés permiso para esta acción', code: 'FORBIDDEN', action: 'canAddProperty' }`.
- **Verificable**: curl con cookie de inquilino devuelve 403 (NO 200).

### AC-2: Middleware `requireRole(action)` deja pasar si el rol tiene el permiso

- **Trigger**: request autenticada con `role=admin` a `POST /api/properties`.
- **Comportamiento**: el backend procede normalmente (200/201).
- **Verificable**: curl con cookie de admin devuelve 201.

### AC-3: Matriz `ROLE_PERMISSIONS` vive en el server (mismas reglas que el frontend)

- **Trigger**: developer revisa `server/lib/permissions.ts` (o equivalente).
- **Comportamiento**: la matriz tiene los 3 roles (admin, propietario, inquilino) y los 10 permisos (`canAddProperty`, `canEditProperty`, etc.) con los mismos valores booleanos que `src/features/auth/permissions.ts`.
- **Razón**: si difieren, la UI oculta algo que el backend permite (o viceversa) → bug de permisos.
- **Mitigación**: el spec exige tests que comparen ambas matrices (test automatizado que falle si difieren).

### AC-4: Cada endpoint privado usa `requireAuth + requireRole(action)`

- **Trigger**: developer revisa cada `router.post/get/patch/delete` en `server/routes/*`.
- **Comportamiento**: cada endpoint tiene la acción correcta aplicada:
  - `POST /api/properties` → `requireRole('canAddProperty')`
  - `PATCH /api/properties/:id` → `requireRole('canEditProperty')`
  - `DELETE /api/properties/:id` → `requireRole('canDeleteProperty')`
  - `POST /api/tenants` → `requireRole('canAddTenant')`
  - `PATCH /api/tenants/:id` → `requireRole('canEditTenant')`
  - `DELETE /api/tenants/:id` → `requireRole('canDeleteTenant')`
  - `POST /api/financial-records` → `requireRole('canAddFinancial')`
  - `DELETE /api/financial-records/:id` → `requireRole('canDeleteFinancial')`
  - `GET /api/reports/*` → `requireRole('canViewReports')` (o el que aplique)
  - `GET /api/settings/*` → `requireRole('canViewSettings')`
  - **Acciones nuevas necesarias** (a definir en este spec):
    - `canAddContract`, `canEditContract`, `canDeleteContract`
    - `canAddInventory`, `canEditInventory`, `canDeleteInventory`
    - `canAddInvoice`, `canSendInvoice`, `canRegisterPayment`
    - `canViewOwnerStatement`, `canRegisterOwnerPayout`
    - `canManageDrive` (uploads a Drive)
    - `canManageNotifications` (config de canales)
    - `canManageSaasBilling` (planes + subscripciones)

### AC-5: Inquilino recibe 403 en TODOS los POST/PATCH/DELETE (solo lectura)

- **Trigger**: inquilino intenta cualquier mutación.
- **Comportamiento**: 403 con código específico.
- **Excepción**: GET endpoints pasan (inquilino puede leer su propia información). Ver AC-6.

### AC-6: GET endpoints respetan ownership (no solo rol)

- **Trigger**: inquilino autenticado pide `GET /api/properties/:id` de una propiedad donde NO es tenant.
- **Comportamiento**: el backend filtra por `tenant_id = req.user.id` (cuando se implemente Fase 3 real) o por `organization_id` (hoy). Inquilino solo ve SUS propiedades.
- **Estado actual**: hoy `GET /api/properties/:id` no filtra por ownership. **Este spec NO cubre esa parte** (es Fase 3 multi-tenant). Solo cubre `requireRole(action)`.

### AC-7: Propietario recibe 403 en acciones destructivas (delete)

- **Trigger**: propietario intenta `DELETE /api/properties/:id`.
- **Comportamiento**: 403 (la UI ya lo oculta, pero el backend debe rechazarlo).

### AC-8: Admin siempre pasa `requireRole(action)`

- **Trigger**: admin intenta cualquier acción.
- **Comportamiento**: 200/201. La matriz `ROLE_PERMISSIONS.admin` tiene todos los permisos = `true`.

### AC-9: Mensaje de error 403 NO revela si la sesión es válida

- **Trigger**: request sin sesión válida a endpoint protegido.
- **Comportamiento**: 401 (no 403). El orden de middlewares importa:
  `requireAuth` PRIMERO → si pasa, `requireRole(action)` SEGUNDO.
- **Razón**: si devuelvo 403 sin validar sesión, leakeo info sobre la
  existencia del endpoint.

### AC-10: Tests automatizados comparan matriz server vs frontend

- **Trigger**: developer corre `npm test`.
- **Comportamiento**: hay un test que lee `server/lib/permissions.ts` y `src/features/auth/permissions.ts` y verifica que sean idénticos. Si difieren → test falla.
- **Razón**: drift entre client/server es exactamente el bug que estamos previniendo.

## 3. Edge Cases

### EC-1 — Sesión válida pero `role` desconocido

- **Trigger**: el `role` en `profiles.role` es 'gerente' (futuro) o NULL.
- **Comportamiento**: `requireRole` devuelve 403 (default deny). El servidor loggea warning.

### EC-2 — Sesión válida, `role='inquilino'`, pide `GET /api/properties`

- **Trigger**: inquilino quiere ver propiedades.
- **Comportamiento**: el GET pasa `requireRole` (lectura no requiere acción específica en este spec). PERO el filtro de ownership (AC-6) limita qué propiedades ve. **Esto es Fase 3.**
- **Para este spec**: el GET pasa con status 200 si la sesión es válida. El filtrado de ownership es out of scope.

### EC-3 — Login endpoint (`POST /api/auth/login`)

- **Trigger**: cualquiera puede llamar login.
- **Comportamiento**: `POST /api/auth/login` NO usa `requireRole` (es el único endpoint sin sesión previa). Solo `POST /api/auth/logout` requiere sesión pero no permiso específico.

### EC-4 — `GET /api/auth/me`

- **Trigger**: usuario autenticado quiere saber su rol.
- **Comportamiento**: usa `requireAuth` (sin acción específica, cualquier usuario autenticado puede verse a sí mismo).

### EC-5 — Owner-payouts (CRUD de transferencias reales)

- **Trigger**: usuario con `role=propietario` quiere ver su estado de cuenta.
- **Comportamiento**: el GET de payouts propios pasa. El POST (registrar transferencia) requiere `canRegisterOwnerPayout` (solo admin, NO propietario).

### EC-6 — SaasBilling endpoints

- **Trigger**: usuario con `role=admin` quiere crear un plan.
- **Comportamiento**: requiere `canManageSaasBilling`. Hoy solo admin.
- **Multi-tenant**: el admin de la agencia puede gestionar SU subscripción. El super-admin (futuro) puede gestionar TODAS. **Out of scope de este spec.**

### EC-7 — Tests que bypassean auth (test runner)

- **Trigger**: tests automatizados llaman endpoints sin cookie.
- **Comportamiento**: el test runner puede setear un header `X-Test-Role: admin` que el middleware acepta solo si `NODE_ENV !== 'production'`. **NO** permitirse en producción.

### EC-8 — Request sin cookie pero con `Authorization: Bearer <jwt>` (futuro)

- **Trigger**: cuando se implemente JWT en SaaS.
- **Comportamiento**: el middleware `requireAuth` debe aceptar AMBOS (cookie httpOnly + Bearer). **Out of scope de este spec.**

### EC-9 — Usuario con permisos mixtos (futuro)

- **Trigger**: cuando un usuario pueda tener permisos custom más allá del rol.
- **Comportamiento**: el middleware debería chequear `(role + custom_permissions)`. **Out of scope.**

### EC-10 — Endpoint sin acción asignada

- **Trigger**: developer agrega un endpoint nuevo y olvida el `requireRole`.
- **Comportamiento**: el endpoint es accesible para cualquier usuario autenticado. **Bug silencioso.**
- **Mitigación**: una verificación al build time o al lint que liste endpoints sin acción asignada (futuro). Por ahora: el spec exige revisión manual en code review.

## 4. Technical Contract

### Middleware nuevo: `requireRole(action)`

```typescript
// server/middleware/requireRole.ts (nuevo archivo)
import { Request, Response, NextFunction } from 'express';
import { ROLE_PERMISSIONS, type Action } from '../lib/permissions.js';

export function requireRole(action: Action) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      // requireAuth debe correr antes. Si llegamos acá sin user, es un bug.
      return res.status(401).json({ error: 'No autenticado', code: 'NO_SESSION' });
    }
    const role = user.role as keyof typeof ROLE_PERMISSIONS;
    const allowed = ROLE_PERMISSIONS[role]?.[action] ?? false;
    if (!allowed) {
      return res.status(403).json({
        error: 'No tenés permiso para esta acción',
        code: 'FORBIDDEN',
        action,
        userRole: role,
      });
    }
    next();
  };
}
```

### Matriz en server: `server/lib/permissions.ts`

```typescript
// Re-export de las mismas reglas que src/features/auth/permissions.ts.
// Single source of truth: el server. El frontend importa desde acá
// (en build time) o mantiene una copia sincronizada por test automatizado.

export type Role = 'admin' | 'propietario' | 'inquilino';

export type Action =
  // Properties
  | 'canAddProperty' | 'canEditProperty' | 'canDeleteProperty'
  // Tenants
  | 'canAddTenant' | 'canEditTenant' | 'canDeleteTenant'
  // Financial
  | 'canAddFinancial' | 'canDeleteFinancial'
  // Contracts (nuevo)
  | 'canAddContract' | 'canEditContract' | 'canDeleteContract'
  // Inventory (nuevo)
  | 'canAddInventory' | 'canEditInventory' | 'canDeleteInventory'
  // Billing (nuevo)
  | 'canSendInvoice' | 'canRegisterPayment'
  // Owner statement (nuevo)
  | 'canViewOwnerStatement' | 'canRegisterOwnerPayout'
  // Drive (nuevo)
  | 'canManageDrive'
  // Notifications (nuevo)
  | 'canManageNotifications'
  // SaaS Billing (nuevo)
  | 'canManageSaasBilling'
  // Reports (existente)
  | 'canViewReports'
  // Settings (existente)
  | 'canViewSettings';

export const ROLE_PERMISSIONS: Record<Role, Record<Action, boolean>> = {
  admin: { /* todos = true */ },
  propietario: {
    canAddProperty: true,
    canEditProperty: true,
    canDeleteProperty: false,
    canAddTenant: false,
    canEditTenant: false,
    canDeleteTenant: false,
    canAddFinancial: true,
    canDeleteFinancial: false,
    canAddContract: true,        // puede proponer contratos
    canEditContract: true,
    canDeleteContract: false,
    canAddInventory: false,      // inventario lo hace el agente
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: true,
    canRegisterOwnerPayout: false,
    canManageDrive: true,
    canManageNotifications: true,
    canManageSaasBilling: false,
    canViewReports: true,
    canViewSettings: false,
  },
  inquilino: {
    canAddProperty: false,
    canEditProperty: false,
    canDeleteProperty: false,
    canAddTenant: false,
    canEditTenant: false,
    canDeleteTenant: false,
    canAddFinancial: false,
    canDeleteFinancial: false,
    canAddContract: false,
    canEditContract: false,
    canDeleteContract: false,
    canAddInventory: false,
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: false,
    canRegisterOwnerPayout: false,
    canManageDrive: false,
    canManageNotifications: false,
    canManageSaasBilling: false,
    canViewReports: false,
    canViewSettings: false,
  },
};
```

### Aplicación por endpoint (ejemplos)

```typescript
// server/routes/properties.ts
router.post("/", requireAuth, requireRole('canAddProperty'), asyncHandler(...));
router.patch("/:id", requireAuth, requireRole('canEditProperty'), asyncHandler(...));
router.delete("/:id", requireAuth, requireRole('canDeleteProperty'), asyncHandler(...));
router.get("/", requireAuth, asyncHandler(...));   // GET = solo requireAuth
router.get("/:id", requireAuth, asyncHandler(...));

// server/routes/tenants.ts
router.post("/", requireAuth, requireRole('canAddTenant'), asyncHandler(...));
router.patch("/:id", requireAuth, requireRole('canEditTenant'), asyncHandler(...));
router.delete("/:id", requireAuth, requireRole('canDeleteTenant'), asyncHandler(...));

// server/routes/billing.ts
router.post("/invoices/send", requireAuth, requireRole('canSendInvoice'), asyncHandler(...));
router.post("/payments", requireAuth, requireRole('canRegisterPayment'), asyncHandler(...));
router.post("/owner-payouts", requireAuth, requireRole('canRegisterOwnerPayout'), asyncHandler(...));
router.get("/owner-statement", requireAuth, requireRole('canViewOwnerStatement'), asyncHandler(...));

// server/routes/entities.ts (contracts)
router.post("/contracts", requireAuth, requireRole('canAddContract'), asyncHandler(...));
router.patch("/contracts/:id", requireAuth, requireRole('canEditContract'), asyncHandler(...));
router.delete("/contracts/:id", requireAuth, requireRole('canDeleteContract'), asyncHandler(...));

// server/routes/inventories.ts
router.post("/", requireAuth, requireRole('canAddInventory'), asyncHandler(...));

// server/routes/googleAuth.ts (Drive)
router.post("/upload-pdf", requireAuth, requireRole('canManageDrive'), asyncHandler(...));
// OAuth callback NO requiere auth ni role (usuario no logueado todavía)

// server/routes/notifications.ts
router.post("/email/verify", requireAuth, requireRole('canManageNotifications'), asyncHandler(...));
router.post("/whatsapp", requireAuth, requireRole('canManageNotifications'), asyncHandler(...));

// server/routes/saasBilling.ts
router.post("/plans", requireAuth, requireRole('canManageSaasBilling'), asyncHandler(...));
router.post("/subscription", requireAuth, requireRole('canManageSaasBilling'), asyncHandler(...));
```

### Respuesta 403

```typescript
{
  error: 'No tenés permiso para esta acción',
  code: 'FORBIDDEN',
  action: 'canAddProperty',  // nombre de la acción que se intentó
  userRole: 'inquilino'      // rol del usuario (debugging)
}
```

### Respuesta 401 (sin sesión)

```typescript
{
  error: 'No autenticado',
  code: 'NO_SESSION'
}
```

## 5. Timeouts (explícitos)

- **Server**: `requireRole` es síncrono (lee de un objeto en memoria). Sin timeout.
- **Cliente**: las requests existentes ya tienen 15s de timeout. La nueva respuesta 403 no cambia el timeout.

## 6. Tostadas exactas (copy approved — NO improvisar)

El middleware `requireRole` devuelve JSON, no UI. Las toasts son del
cliente que MANEJA el 403:

| Trigger (cliente) | Tipo | Copy exacto |
|---|---|---|
| Fetch devuelve 403 | error | "No tenés permiso para hacer esto." |
| Fetch devuelve 401 | error | "Sesión expirada. Volvé a iniciar sesión." |
| Admin hace acción de admin | success | (no toast, ya estaba permitido) |
| Inquilino intenta mutación → 403 | error | "Los inquilinos no pueden modificar recursos." |

## 7. Dependencias

### Archivos a crear (nuevos)
- `server/middleware/requireRole.ts` — el middleware nuevo.
- `server/lib/permissions.ts` — la matriz (equivalente server-side de `src/features/auth/permissions.ts`).
- `tests/permissions-matrix.test.ts` — test que compara server vs frontend.

### Archivos a modificar
- `server/routes/properties.ts` — agregar `requireRole` a POST/PATCH/DELETE.
- `server/routes/tenants.ts` — idem.
- `server/routes/inventories.ts` — idem.
- `server/routes/entities.ts` — idem (contracts POST/PATCH/DELETE).
- `server/routes/billing.ts` — idem (invoices/send, payments, owner-payouts).
- `server/routes/googleAuth.ts` — idem (upload-pdf, create-property-folders).
- `server/routes/notifications.ts` — idem (whatsapp, email/verify, email/test).
- `server/routes/saasBilling.ts` — idem (plans POST/PUT/DELETE, subscription).
- `src/features/auth/permissions.ts` — actualizar tipo `RolePermissions` para incluir las acciones nuevas (puede ser tipo separado del server, pero los booleanos deben coincidir).

### Archivos a NO tocar (out of scope explícito)
- `src/App.tsx` — la UI ya oculta botones correctamente con `can()`. No necesita cambios para este spec.
- `server/db.ts` — la conexión DB no cambia.
- `db/mysql/migrations/*` — sin cambios de schema.

## 8. Out of Scope

- ❌ **Multi-tenancy real** (per-org filtering) — sigue single-tenant.
- ❌ **JWT / OAuth** — sigue cookie httpOnly del piloto.
- ❌ **Permisos custom por usuario** (más allá del rol) — solo rol-based.
- ❌ **Filtrado de GET por ownership** (ej: inquilino solo ve SUS propiedades) — Fase 3 multi-tenant.
- ❌ **Rate limit en login** — security, separado.
- ❌ **CSRF token** — security, separado.
- ❌ **Tests automatizados de cada endpoint** (vitest por endpoint) — el verifier E2E cubre los críticos. Unit tests del middleware están en este spec.

## 9. Riesgos identificados

- **Drift server vs frontend**: si alguien edita una matriz y no la otra, hay bug silencioso. Mitigación: test automatizado que compara.
- **Olvidar `requireRole` en endpoint nuevo**: bug silencioso. Mitigación: code review + checklist de code review.
- **Over-broad permissions**: si le damos `canAddProperty: true` al inquilino por error, el agujero queda. Mitigación: spec estricto + tests.
- **Breaking change en UI**: si la UI manda requests que ahora devuelven 403, hay que actualizar el frontend. Mitigación: la UI actual YA oculta esos botones, así que NO debería romper nada en flujos normales.

## 10. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** —
**Fecha de aprobación:** —

---

> **Recordatorio Karpathy**: una vez aprobado, sigue `tests/verifiers/fix-issue-permissions-by-endpoint.md`. NO escribir código de implementación hasta que el spec esté aprobado.