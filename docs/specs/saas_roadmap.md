# SaaS Roadmap — InmoControl (4 specs pendientes)

> **Status:** ⏳ No escritos todavía. Son placeholders para futuras
> iteraciones de la metodología Karpathy.
>
> Este doc resume los 4 specs que faltan para completar el SaaS de
> InmoControl. NO son specs formales (sin ACs, sin edge cases, sin
> technical contract) — son **outlines** para que cuando los
> escribamos, ya sepamos el scope.

---

## Spec 3: `saas_admin_panel.md` — Panel de Super-Admin

**Quién lo usa:** vos (el dueño de InmoControl).
**Cuándo:** después de `saas_multitenant.md` + `saas_signup.md` están en prod.

**User Story:**
Como dueño de InmoControl, quiero ver todas las orgs registradas, MRR, churn, y poder suspender cuentas o impersonar usuarios, para dar soporte y operar el SaaS.

**Outlines de ACs (NO formal):**

- AC-1: Ruta nueva `/admin` (protegida por rol `super_admin`).
- AC-2: Lista paginada de orgs con filtros (plan, status, fecha de signup).
- AC-3: Detalle de org: members, propiedades, contratos, invoices, MRR histórico.
- AC-4: Acciones: suspend, reactivate, impersonate (genera sesión de 1h a nombre del admin target).
- AC-5: Dashboard de métricas: total orgs, MRR, churn rate, top planes.
- AC-6: Audit log: cada acción del admin se loguea con `who, what, when, why`.

**Dependencias técnicas:**

- Nuevo rol `super_admin` en la tabla `profiles`.
- Middleware `requireSuperAdmin` (similar a `requireRole`).
- Vista nueva en React (puede vivir en `src/features/admin/`).
- Tabla nueva `admin_audit_log` (migración nueva).

**Esfuerzo estimado:** 1-2 días.

---

## Spec 4: `saas_user_mgmt.md` — Gestión de Usuarios por Organización

**Quién lo usa:** el admin de cada agencia (post-signup).
**Cuándo:** después de `saas_signup.md`.

**User Story:**
Como admin de una agencia, quiero invitar a mis colegas (agentes, contadores) a la plataforma con roles diferenciados, para que cada uno vea solo lo que necesita y mis datos queden organizados.

**Outlines de ACs (NO formal):**

- AC-1: `POST /api/saas-billing/invitations` con `{email, role, orgId}`. Genera token único + URL de aceptación.
- AC-2: Email con magic link (requiere nodemailer). El user clickea → crea profile con la org del invitador.
- AC-3: Roles disponibles: `admin`, `agent`, `viewer`. `viewer` es read-only.
- AC-4: `GET /api/saas-billing/members` lista los profiles de la org con sus roles.
- AC-5: `DELETE /api/saas-billing/members/:id` (solo admin) elimina un user de la org.
- AC-6: Límite de `max_users` del plan: si la org llega al límite, no se pueden enviar más invitaciones.
- AC-7: UI en Configuración → "Equipo" con tabla de miembros + botón "Invitar".

**Dependencias técnicas:**

- Tabla nueva `org_invitations` (token, email, role, org_id, expires_at, accepted_at).
- Migración nueva.
- `nodemailer` ya está instalado (Fase 7).
- Nuevos permisos `canManageOrgUsers` y `canInviteUsers` en el sistema de roles.

**Esfuerzo estimado:** 1-2 días.

---

## Spec 5: `saas_psp_integration.md` — Integración Real con PSP (Wompi o MercadoPago)

**Quién lo usa:** las agencias que pagan la subscripción.
**Cuándo:** cuando se decida qué PSP usar en Colombia. Costo: 1-3 días solo de integración.

**User Story:**
Como agencia con suscripción paga, quiero pagar con PSE o tarjeta de crédito (vía Wompi o MercadoPago) sin salir de la app, para que la subscripción se renueve automáticamente cada mes.

**Outlines de ACs (NO formal):**

- AC-1: Los endpoints `POST /api/saas-billing/subscription` y `POST /api/saas-billing/invoices/:id/pay` actualmente MOCK → reemplazarlos por calls a Wompi o MercadoPago.
- AC-2: Wompi: usar `wompi-api` (oficial). MercadoPago: usar `mercadopago` SDK.
- AC-3: Webhook `POST /api/saas-billing/webhook/psp` que recibe el `payment.approved` y actualiza `saas_subscriptions.status` y `saas_invoices.status`.
- AC-4: UI de checkout: redirige a Wompi/MercadoPago, vuelve a InmoControl, muestra el estado de la suscripción.
- AC-5: Reintentos automáticos si el pago falla (3 intentos en 7 días, después cancelar trial).
- AC-6: Compliance: enviar factura electrónica DIAN por cada pago (requiere integración con un proveedor de facturación — out of scope para v1).

**Dependencias técnicas:**

- Cuenta de Wompi o MercadoPago (requerida para prod).
- Webhook URL público (Hostinger lo permite).
- Migración nueva para guardar `psp_transaction_id` en `saas_invoices`.
- Variable de entorno `WOMPI_PRIVATE_KEY` o `MERCADOPAGO_ACCESS_TOKEN`.

**Esfuerzo estimado:** 1-3 días (depende del PSP y de las pruebas de sandbox).

---

## Spec 6: `saas_onboarding.md` — Onboarding Post-Signup

**Quién lo usa:** un admin nuevo (post-signup, sin conocer la app).
**Cuándo:** después de `saas_signup.md`. Es UX, no crítico para funcionalidad.

**User Story:**
Como admin nuevo, quiero un tour guiado de 3-5 pasos que me muestre las funciones principales (crear propiedad, agregar tenant, ver billing) en los primeros 5 minutos, para entender la app sin leer documentación.

**Outlines de ACs (NO formal):**

- AC-1: Componente `OnboardingTour` con state machine: paso 1 (Propiedades) → paso 2 (Inquilinos) → paso 3 (Contratos) → paso 4 (Billing) → paso 5 (Integraciones).
- AC-2: Cada paso muestra un modal con un screenshot de la vista + un botón "Ir a..." que navega.
- AC-3: El user puede cerrar el tour en cualquier paso. Una vez cerrado, NO vuelve a aparecer (estado en `localStorage`).
- AC-4: Al finalizar el tour, se otorga un badge "Onboarding completo" (cosmético).
- AC-5: El tour se muestra también después de crear la primera propiedad (mini-celebración).

**Dependencias técnicas:**

- Nuevo componente React (`src/features/onboarding/OnboardingTour.tsx`).
- Nuevo hook `useOnboarding` con localStorage.
- Sin backend nuevo (todo es frontend).

**Esfuerzo estimado:** 1 día.

---

## Orden de implementación sugerido

1. **`saas_multitenant.md`** (Seguridad — bloqueante)
2. **`saas_signup.md`** (Crítico para adquirir clientes)
3. **`saas_user_mgmt.md`** (Importante para escalar una agencia)
4. **`saas_admin_panel.md`** (Importante para vos como operador)
5. **`saas_psp_integration.md`** (Crítico para monetizar, pero solo después de tener usuarios)
6. **`saas_onboarding.md`** (Nice-to-have, último)
