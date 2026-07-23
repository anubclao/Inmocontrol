# AGENTS.md — convenciones de InmoControl

> Para agentes y humanos que trabajen en este repo. Léeme antes de tocar.

## Identidad del proyecto

- **Nombre:** InmoControl
- **País objetivo:** Colombia
- **Moneda por defecto:** COP, sin decimales
- **Idioma de la UI:** español (es-CO)
- **No usar Gemini / AI Studio branding** en docs, ni dejar la `GEMINI_API_KEY` como dependencia dura (la app abre sin ella).

## Stack y comandos

- Front: React 19 + Vite 6 + Tailwind 4
- Estado: **Zustand** (migración en curso desde `localStorage` directo)
- Backend: Express + Vite middleware, un solo puerto (3000)
- Reportes: jsPDF
- Lint: `tsc --noEmit` (sin ESLint configurado todavía)

```bash
npm install      # instalar
npm run dev      # http://localhost:3000
npm run lint     # type-check
npm run build    # dist/ listo para hosting
```

## Estructura objetivo (Fase 2+)

```
src/
  App.tsx                    # shell + router (mientras se parte)
  main.tsx                   # entry point
  features/                  # vistas agrupadas por dominio
    auth/                    # login + useAuth + ROLE_PERMISSIONS
    properties/              # PropertiesView + wizard
    tenants/                 # TenantsView
    financial/               # FinancialView + cálculos + PDF
    dashboard/               # DashboardView
    reports/                 # ReportsView
    alerts/                  # AlertsView
    settings/                # SettingsView
  shared/
    hooks/                   # useLocalStorage, useToasts
    store/                   # Zustand appStore (única fuente de verdad)
    ui/                      # primitives (Button, Card, Input, Modal, cn)
    format/                  # currency, date, id, chip
    validators/              # moved from utils/validators.ts
  lib/
    pdf/                     # jsPDF helpers (liquidación mensual, inventario)
  types/                     # contratos de dominio
  utils/                     # cálculos legacy — migrar a shared/finance/
```

## Convenciones clave

- **Persistencia:** Zustand store con `persist` (clave raíz `inmocontrol:v1`).
  - Si necesitas leer/escribir una colección, usa el store. **No** uses
    `localStorage` directo excepto en el storage adapter del store.
- **Selectores:** usa los selectores finos (`selectProperties`, etc.) en
  lugar de destructurar el state completo.
- **Tipos:** nuevos tipos de dominio van en `src/types/`. Tipos internos
  de un feature van en `src/features/<x>/types.ts`.
- **Fechas:** siempre ISO en storage (`YYYY-MM-DD`), `dd/mm/yy` en UI.
- **Moneda:** `formatCurrency()` de `utils/calculations.ts` (mover a
  `shared/format/` cuando se parta el monolito).

## Reglas para cambios

1. **No rompas el monolito en un solo commit.** Parte `App.tsx` por vistas
   (una a la vez), manteniendo la app corriendo entre cada paso.
2. **Antes de cada cambio grande:** corre `npm run lint` y `npm run dev` para
   tener baseline.
3. **Después de cada cambio:** corre `npm run lint` y verifica que `/api/health`
   sigue 200.
4. **Comentarios:** explica el "por qué", no el "qué". El código se lee solo.
5. **No introduzcas dependencias** sin discusión previa. **Aprobadas hasta
   ahora:** Zustand, Twilio (`twilio` SDK para el adapter de WhatsApp en
   `server/routes/notifications.ts` — ver Fase 6), nodemailer (adapter de
   email con SMTP/SendGrid en el mismo archivo — ver Fase 7). Cualquier otra
   requiere conversación explícita.

## Lo que NO hacer

- ❌ No añadas `GEMINI_API_KEY` como required. La app es SaaS colombiano, no demo de AI Studio.
- ❌ No metas ESLint, Prettier, Vitest sin discutirlo primero. Primero refactor, luego tooling.
- ❌ No crees un backend con DB real hasta que el monolito esté partido y la lógica financiera validada.
- ❌ No uses `localStorage` directo fuera de `shared/store/`. Todo va por Zustand.

## Deploy a Hostinger (flujo limpio, Julio 2026)

> Cada `git push` → redeploy automático. NO requiere FTP ni intervención manual.

**El proyecto compila en 2 outputs:**
- `dist/` — frontend estático (vite build)
- `dist-server/server.js` — backend bundleado (esbuild, single-file con todo inline)

**Scripts clave:**
- `npm run build` → corre `build:client` + `build:server` (ambos en uno)
- `npm start` → `NODE_ENV=production node dist-server/server.js`

**Lo que NO se sube al server:**
- `node_modules/` (Hostinger instala con npm install en cada deploy)
- `supabase/` (legacy — ya no se usa, eliminar)
- `.env*` (los env vars se configuran en el panel)

**Auto-deploy Hostinger:**
1. Push a `main` → Hostinger clona, `npm install`, `npm run build`, publica `dist/`, arranca `npm start`.
2. Si falla: revisar "Registros de tiempo de ejecución" en el panel (debe tener logs, no estar vacío).

**Para deploy fresh:**
1. Panel → Avanzado → Node.js → Create Application (Application root: project root, startup: `npm start`).
2. Variables de entorno (ver `.env.production.example`).
3. Schema de DB: importar `db/mysql/schema-hostinger.sql` vía phpMyAdmin.
4. Seed: `curl -X POST -H "X-Admin-Seed-Token: <token>" https://<dominio>/api/admin/seed`.

## Estado del refactor

| Fase | Estado | Notas |
|------|--------|-------|
| 1. Ordenar lo existente | ✅ | README, metadata, lint, hooks base, store base |
| 2. Refactor por dominios | ⏳ | App.tsx sigue monolítico, 3158 líneas |
| 3. Auth + roles | ⏸️ | Diferido por decisión del usuario |
| 4. Lógica financiera Colombia | ⏳ | Falta retefuente, GMF ya está |
| 5. Datos y exportación | ⏸️ | Después de Fase 2 |
| 6. Notificaciones (Twilio) | ✅ | Tipos + derivación + config + log + adapter WhatsApp (sandbox → producción) |
| 7. Notificaciones (Email) | ✅ | Multi-buzón por propósito (cobros, contratos, alertas, marketing, general) con SMTP o SendGrid. Backend con nodemailer. Frontend con `emailConfig` per-agency en `notificationConfigStore` (SaaS-ready). |
| 8. SaaS Billing | ✅ | Planes CRUD en DB (`saas_plans`), subscripción per-agency (`saas_subscriptions`), métodos de pago (`saas_payment_methods`), facturas con IVA 19% (`saas_invoices`). PSP MOCK (Wompi/MercadoPago cuando se enchufe). UI: `SaasBillingView` customer-facing + `PlanAdminView` admin. Banner de límite en Dashboard. |
| 9. Cuenta de cobro mensual | ✅ | Flujo "Enviar CC" → "Marcar pagado" en `AmortizationTable` del módulo Billing. PDF con formato colombiano clásico (`cuentaCobroPdf.ts`). Consecutivo `invoice_number` (CC-YYYYMM-NNN) generado por backend. Mes N+1 se desbloquea automáticamente al marcar paid el mes N. Endpoint nuevo: `POST /api/billing/invoices/send`. Migración: `004_invoice_number.sql`. |
| 10. Estado de cuenta del propietario | ✅ | Estado de cuenta mensual al PROPIETARIO con resumen ejecutivo + tabla de detalle de movimientos + transferencias reales registradas. PDF replica el `modelo-estado-de-cuenta.pdf` adaptado (omite sección 5 "antigüedad", adapta sección 6 "instrucciones de pago" al propietario). Tabla nueva `owner_payouts` para registrar transferencias reales. Endpoint nuevo: `GET /api/billing/owner-statement` (combina amortización + descuentos + settlement + payouts). Migración: `005_owner_payouts.sql`. UI: `EstadoCuentaView` reemplaza `AccountStatementView`. |
| 11. Subida automática a Google Drive | ✅ | Acta de entrega + cuenta de cobro + estado de cuenta se suben automáticamente a Drive tras generarse. Endpoint genérico nuevo: `POST /api/drive/upload-pdf` (subcarpeta arbitraria, crea on-demand). Helper frontend: `uploadPdfToDrive` en `driveService.ts`. Destinos: acta → `Acta/` del inquilino · cuenta de cobro → `Recibos/` del inquilino · estado de cuenta → `Propietario/EstadosCuenta/` de la propiedad. Si Drive no está conectado, el PDF se descarga local igual (no rompe el flujo). |

## Decisiones cerradas (no renegociar sin conversación explícita)

### Flujo de propiedad
1. **Wizard 3 pasos**: Datos básicos → 5 docs legales (CC, Certificado, Predial, RUT, Mandato) → Inventario.
2. **Inventario de captación** (`phase='inicial'`): **sin firmas de arrendatario** — solo agente + propietario firman al finalizar (en realidad, en el wizard actual el PDF se genera con placeholders "pendiente" para arrendatario/agente; la firma real de esas dos partes se hace en el Inventario de Colocación cuando hay inquilino).
3. **Inventario de colocación** (`phase='final'`): **2 firmas** (arrendatario + agente). Se hace DESPUÉS de asignar el inquilino. La firma del propietario va en el Contrato de Mandato y en el Contrato de Arrendamiento, NO acá.
4. **Contrato de Arrendamiento**: PDF separado, subido por el agente en el módulo Arrendatarios a `Recibos/../Contrato/`. NO se genera desde el wizard de inventario.
5. **Mandato firmado**: requerido para pasar estado a "Activo" 100%. Vive en `properties.mandato_pdf_url` (no en `property_documents`).

### Estructura Drive (NO cambiar sin discutir)
```
Mi unidad / InmoControl/                          ← creado por OAuth una vez
└── {dirección del inmueble}/                      ← por propiedad
    ├── Propietario/                                ← 5 docs legales
    ├── Inventarios/                                ← PDFs inventario captación + colocación
    └── {nombre} ({cédula})/                        ← por inquilino (dentro de la propiedad)
        ├── Cedula/
        ├── Contrato/
        └── Recibos/
```

### Reglas de borrado (trazabilidad legal)
- `DELETE /api/properties/:id` retorna **409** si la propiedad tiene inventarios.
- En la UI, el botón 🗑 trash se reemplaza por 🔒 candado gris con tooltip cuando `inventoryCount > 0`.
- Para retirar un inmueble del mercado → cambiar a estado `Inactivo`, **NO eliminar**.

### Reglas del wizard (evitar regresiones ya corregidas)
- `PropertiesView.handleFinalize` es la ÚNICA función que crea carpetas Drive para una propiedad. NO llamar `createPropertyFolders()` desde fuera (estaba duplicando carpetas).
- El endpoint `GET /api/drive/create-property-folders` **chequea si ya existe** antes de crear (defensa por si algo lo llama).
- `appStore.addProperty` chequea `if (p.id)` antes de postear — si la propiedad ya viene con `id` del wizard, **no postea de nuevo**.
- `StepInventory` pasa el inventario explícitamente a `onComplete(finalInv)` para evitar el bug de closure stale donde `wizardInventory` quedaba en `null` al ejecutar `handleFinalize`.
- El preview de PDFs en el wizard usa `blob:` URL real (no `'__pending__'`) — `URL.revokeObjectURL` se llama al cerrar/reemplazar doc para evitar memory leaks.

### Flujo de cuenta de cobro mensual (BillingPanel → AmortizationTable)
- **Matriz de UX por fila** (decisión del usuario: "marcar pagado habilita el siguiente mes"):
  - Mes N+1 **BLOQUEADO** (🔒 + tooltip "Pagá el mes anterior para habilitar") hasta que el mes N esté `paid`.
  - Mes N habilitado y NO enviado → botón **"Enviar CC"** (PDF con formato colombiano clásico).
  - Mes N habilitado y enviado (tiene `sentAt`) → botón **"Marcar pagado"** (abre PaymentModal existente).
  - Mes N pagado → solo label verde "✓ Pagado".
- **Consecutivo `invoice_number`** formato `CC-YYYYMM-NNN`, scoped por (property_id, period). Lo genera el backend en `POST /api/billing/invoices/send`. Es idempotente: re-envío conserva el número.
- **PDF de cuenta de cobro** (`src/features/billing/cuentaCobroPdf.ts`) replica el modelo `Modelo-cuenta-de-cobro.pdf`. Adaptación al flujo InmoControl:
  - "DEBE A" = nombre del INQUILINO (no del propietario — interpretamos que la cuenta es INMOVIRTUAL cobra al inquilino).
  - "OBJETO" = canon + admin del inmueble + número de contrato.
  - Datos de consignación = `BillingPolicy.bankAccounts[primary]` (si no hay, muestra línea punteada).
  - Valor en letras via `numeroAPesosColombianosCaps` (formato "PESOS M/CTE" colombiano).
- **Backend `ensureInvoice` renombrado a `markInvoicePaid`**: ya NO crea el invoice automáticamente al pagar. La factura la crea el agente con "Enviar CC". Caso edge (pago sin envío previo) crea invoice con `status='paid'` y `sent_at=NULL` para no perder trazabilidad.
- **Schema**: `rent_invoices.invoice_number VARCHAR(20) NULL` (migración `004_invoice_number.sql`). Índice `invoices_invoice_number_idx`. Aplicar con `node scripts/apply-004-migration.mjs` después de arrancar MySQL.

### Flujo de estado de cuenta del propietario (BillingPanel → EstadoCuentaView)
- **Concepto**: documento MENSUAL que INMOVIRTUAL le envía al PROPIETARIO con el detalle del mes (ingresos cobrados al inquilino, gastos aplicados, retenciones, neto calculado, transferencias reales, saldo final). El propietario debe revisarlo y reportar inconsistencias en 5 días hábiles.
- **Doble componente del documento** (decisión del usuario: "mostrar ambos"):
  - **NETO CALCULADO** (teórico): sale de `calculateMonthlySettlement` con inputs del contrato activo (canon, admin, comisionPct).
  - **TRANSFERENCIAS REALES**: tabla `owner_payouts` que el agente registra con fecha + monto + banco + referencia. Línea por línea.
  - **SALDO FINAL** = `netCalculated - totalPayouts`. Si es positivo, hay saldo a favor del propietario pendiente. Si es 0, todo cuadrado. Si es negativo, se giró de más (requiere investigación).
- **PDF** (`src/features/billing/estadoCuentaPdf.ts`) replica `modelo-estado-de-cuenta.pdf` con estas adaptaciones:
  - **Sección 5 (clasificación por antigüedad) OMITIDA** — no aplica a InmoControl (siempre es a favor del propietario después del giro).
  - **Sección 6 (instrucciones de pago)** → datos del PROPIETARIO (a dónde le transferimos), no del cliente que paga.
  - **Sección 7 (observaciones)** → copy adaptado (5 días hábiles para reportar, transferencias solo a cuentas registradas).
  - **Sección 8 (firmas)** → Elaboró (agente) / Aprobó (gerencia) / Recibido por (propietario).
- **Schema**: tabla `owner_payouts` (migración `005_owner_payouts.sql`). Una fila por transferencia. Migración idempotente (`CREATE TABLE IF NOT EXISTS`). Aplicar con `node scripts/apply-005-migration.mjs`.
- **UI**: `EstadoCuentaView` reemplaza `AccountStatementView` (la anterior solo mostraba el cálculo, no las transferencias reales ni el PDF). CRUD de payouts vía modal "Registrar transferencia".
- **Endpoint clave**: `GET /api/billing/owner-statement?propertyId=&period=` devuelve el statement consolidado con TODO (ingresos + descuentos + settlement + payouts). El PDF y la UI consumen esta salida directamente.

### Subida automática a Google Drive (acta + cuenta de cobro + estado de cuenta)
- Los 3 tipos de PDF que genera la app se suben a Drive automáticamente tras emitirse, además de la descarga local. **Si Drive no está conectado, la descarga local sigue funcionando** (el flujo no se rompe).
- **Endpoint genérico**: `POST /api/drive/upload-pdf` (`server/routes/googleAuth.ts`) — acepta cualquier nombre de subcarpeta y la crea on-demand si no existe. Helper interno: `getFreshDriveClientPublic()` (refresca el token OAuth si está por expirar).
- **Helper frontend**: `uploadPdfToDrive(blob, parentFolderId, parentKind, subfolder, fileName)` en `src/lib/drive/driveService.ts`. Convierte el Blob a base64 y llama al endpoint. Devuelve `{ fileId?, webViewLink?, skipped?, error? }`.
- **Destinos de cada PDF**:
  | Documento | Cuándo se genera | Carpeta en Drive |
  |---|---|---|
  | **Acta de entrega** | `ActaEntregaModal → Guardar en Drive` (botón manual) | `Acta/` dentro de `{nombre} ({cédula})/` del inquilino |
  | **Cuenta de cobro** | `BillingPanel → Enviar CC` (automático) | `Recibos/` dentro de `{nombre} ({cédula})/` del inquilino |
  | **Estado de cuenta** | `EstadoCuentaView → Descargar PDF` (automático) | `Propietario/EstadosCuenta/` dentro de `{dirección}/` de la propiedad |
- **Naming convention**:
  - Acta: `ActaEntrega_{tenant}_{YYYY-MM-DD}.pdf` (definido en `ActaEntregaModal.buildFilename`)
  - Cuenta de cobro: `CuentaCobro_{invoiceNumber}_{period}.pdf` ej: `CuentaCobro_CC-202607-001_2026-07.pdf`
  - Estado de cuenta: `EstadoCuenta_{EC-YYYYMM}_{dirección}.pdf` ej: `EstadoCuenta_EC-202607_Calle_93_11-27_Apto_501.pdf`
- **Permisos**: igual que los otros uploads, el PDF se hace `reader/anyone` automáticamente (cualquiera con el link puede ver). Si en el futuro se quiere privado, cambiar `drive.permissions.create` en el endpoint nuevo.
- **Logs**: el `handleSendInvoice` y `handleGeneratePdf` loggean acción en `property_actions` con sufijo "· subida a Drive" cuando la subida fue exitosa.

### Endpoints backend útiles
- `GET /api/properties/:id` — devuelve propiedad puntual con `inventory_count` y `documents`. Usado para refrescar local state post-wizard.
- `GET /api/properties` — lista con `inventory_count` (LEFT JOIN).
- `POST /api/properties` — INSERT si `localId` es `wizard-*` o undefined; UPSERT si `localId` es UUID real. Crea carpeta Drive solo en INSERT.
- `POST /api/inventories` — recibe `id` (≤36 chars, server usa `crypto.randomUUID()` si es más largo).
- `POST /api/inventories/upload-pdf` — sube PDF a `Inventarios/` de la propiedad.
- `POST /api/inventories/upload-photos` — sube fotos a subcarpeta `Inventario captacion/` o `Inventario colocacion/`.
- `POST /api/tenants` — crea inquilino en MySQL + carpeta `{nombre} ({cédula})/` dentro de la propiedad, con subcarpetas `Cedula/`, `Contrato/`, `Recibos/`.
- `POST /api/tenants/upload-document` — sube PDF a la subcarpeta del inquilino.

### Nombres de columnas de PDFs del inventario (NO confundir)
- ✅ `inventory_pdf_url` (legacy, se mantiene por compat)
- ✅ `inventory_captacion_pdf_url` (inglés, este es el real en la DB)
- ✅ `inventory_colocacion_pdf_url` (inglés, este es el real en la DB)
- ❌ `inventario_captacion_pdf_url` (español — NO existe, mi migración NO creó esta)
- ❌ `inventario_colocacion_pdf_url` (español — NO existe)

Si un SELECT falla con "Unknown column inventario_captacion_pdf_url", es porque alguien (como yo) usó el nombre español. Usar el inglés: `inventory_captacion_pdf_url`. La respuesta del API puede usar el alias español para clientes que lo prefieran, pero la DB es inglés.

### Migración 009 — reconcilia el schema canónico con la realidad (jul-2026)
El `schema-hostinger.sql` y `schema-completo.sql` documentaban las 2 columnas
(`inventory_captacion_pdf_url`, `inventory_colocacion_pdf_url`) **pero nunca las
incluían en el `CREATE TABLE`**. Resultado: drift silencioso entre docs y DB.
Cualquier `GET /api/properties/:id` o `POST /api/inventories/upload-pdf` tiraba
500 con `ER_BAD_FIELD_ERROR` hasta que se aplicó la migración.

- **Fix**: `db/mysql/migrations/009_properties_inventory_pdf_urls.sql` (idempotente).
  Aplicar con `node scripts/apply-009-migration.mjs` (o pegar el SQL en phpMyAdmin).
- **Replicado en**: `schema-completo.sql` y `schema-hostinger.sql` (ambas ya tienen
  las columnas dentro del `CREATE TABLE` de `properties`, así deploys frescos
  arrancan limpios).
- **Removida la rama defensiva rota** de `server/routes/inventories.ts:336` que
  intentaba `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (sintaxis PostgreSQL,
  inválida en MySQL 8). Con la migración aplicada, la columna YA existe — esa
  rama era un parche que en realidad rompía más de lo que arreglaba.

### Schema importante de `properties.status`
- Constraint: `CHECK (status IN ('Pendiente','Activo','En Colocación','Arrendado','Inactivo'))`
- NO acepta 'available'/'rented'/'maintenance' (esa era la convención vieja)
- Wizard DEBE mandar el status en el UPSERT del step 3 (no solo al store local)
- Frontend mapper convierte automáticamente server → Spanish por si quedan rows viejos

### Flujo de status de una propiedad
```
Pendiente ──(wizard completo + mandato firmado)──► Activo
Activo    ──(crear arrendatario)────────────────► En Colocación
En Colocación ──(firmar inventario de colocación)──► Arrendado
Activo | En Colocación | Arrendado ──(dueño retira)──► Inactivo
```
- **En Colocación** = ya tiene arrendatario asignado pero el Inventario de Colocación
  todavía no está firmado. No se debe poder asignar otro inquilino a esa propiedad
  (filtro `availableProperties` ya lo excluye).
- **Arrendado** = SOLO cuando el Inventario de Colocación está firmado (2 firmas:
  arrendatario + agente). Hasta entonces, la propiedad NO está formalmente arrendada.

### `GET /api/properties/:id` auto-refresh
Cuando el usuario abre el modal de detalle, el frontend hace `GET /api/properties/:id` para traer el estado real del server (no el Zustand state stale). Si la query SQL falla con 500, el modal muestra datos viejos. **SIEMPRE verificar los nombres de columnas en inglés (`inventory_*` no `inventario_*`).**

### SaaS Billing (Fase 8) — namespace separado
- **NO** usar `/api/billing/*` para billing del SaaS — ese namespace es de
  billing de PROPIEDADES (arriendos). Para SaaS usar `/api/saas-billing/*`.
- Tablas `saas_*` (planes, subscriptions, payment_methods, invoices) — son
  del SaaS. Las existentes (`billing_policies`, `amortization_rows`, etc.)
  son de propiedad.
- PSP: MOCK por ahora. Cuando se enchufe Wompi/MercadoPago, los endpoints
  `/subscribe`, `/invoices/:id/pay` y `/payment-methods` se reemplazan por
  integraciones reales. El frontend no cambia.
- Catálogo de planes es GLOBAL (compartido entre orgs). Subscripción y
  métodos de pago son PER-ORG (`organization_id` FK).
- IVA colombiano 19% se calcula al facturar (`COLOMBIA_IVA_RATE = 0.19`).
  Mostrar subtotal + IVA + total en UI (estándar colombiano).

### Onboarding de testers (Google OAuth)
- **Problema típico**: tester intenta "Conectar Drive" → rebota con
  `403 access_denied` + mensaje de Google "la app se está probando y solo
  pueden acceder a ella los testers aprobados por el desarrollador".
- **Causa**: la OAuth app de InmoControl está en modo **Testing** en Google
  Cloud Console (no verificada). Solo los emails listados como Test users
  pueden autorizar.
- **Fix (30 seg, sin redeploy)**: Google Cloud Console → APIs & Services →
  OAuth consent screen → sección **Test users** → `+ ADD USERS` → pegar
  email del tester → Save.
- **No olvidarse de agregarse a uno mismo**: el developer/owner también
  tiene que estar en la lista, sino no puede conectar su propio Drive.
- **Hygiene**: cada tester usa **su propio Chrome profile** con **su
  cuenta de Google**. Si comparten perfil, Chrome muestra un popup
  confuso de "Cambiar a un perfil de Chrome" y el que termina
  autorizando puede ser la cuenta equivocada.
- **Warning amarillo "Google no ha verificado esta app"**: es normal en
  modo Testing. El tester tiene que clickear "Avanzado → Ir a ... (no
  seguro)" la primera vez. Solo desaparece cuando la app se publique a
  producción.
- **Guía completa paso a paso + tabla de testers actuales**:
  [`docs/TESTERS.md`](docs/TESTERS.md). Actualizar ese doc cuando se sume
  o salga un tester.

### Recuperación de wizard interrumpido (PENDIENTE)
- Hoy: si el usuario cierra el browser en medio del wizard, **se pierde todo** (estado solo en React, no persistido).
- Estado futuro: wizard state en localStorage para permitir "Continuar registro" al volver. **NO implementar hasta que se cierre el flujo actual completo** (Cobranza + Comparativa + Acta).

### Metodología Karpathy (Agent Skill) — Spec + Verifier + Environment
Adoptada el 2026-07-22 después de la cadena de bugs en producción
("Guardar borrador" mintiendo, "Continuar a Documentación" colgando,
phone/email NULL, modal de tenant cerrándose antes del POST, etc.).
**Reglas obligatorias para cualquier feature nuevo o fix grande.**

#### Workflow (5 fases, ejecución estricta)

1. **FASE 1 — ENVIRONMENT** (5 min): leer `docs/env/ARCHITECTURE.md` +
   `docs/env/CONSTRAINTS.md` + este AGENTS.md. Confirmar al user que
   entendiste el stack. **NO escribir código todavía.**

2. **FASE 2 — SPEC**: crear `docs/specs/{nombre}.md` desde el template.
   Definir: User Story + Acceptance Criteria numerados (binarios,
   testeables) + Edge Cases + Technical Contract (interfaces TS, endpoints,
   props) + Dependencias + Out of Scope + **Tostadas exactas** (copy
   approved, NO improvisar) + **Timeouts explícitos**. Pedirle al user
   que apruebe. **NO escribir código de implementación todavía.**

3. **FASE 3 — VERIFIER**: una vez aprobado el spec, crear
   `tests/verifiers/{nombre}.md` desde el template E2E. Cada AC debe
   tener 1+ pasos verificables (curl + checklist manual). **NO
   modificar el verifier para hacer pasar los checks** (eso es
   trampa). Si falla, el código está mal.

4. **FASE 4 — IMPLEMENTACIÓN** (recién ahora, después de verifier
   aprobado). Tocar código **mínimo** para que el verifier pase.
   No agregar features fuera del spec. Si aparece un bug que requiere
   cambiar el spec, volver a Fase 2 (no "arreglar por las suyas").

5. **FASE 5 — REFACTOR & VERIFY**: correr el verifier de nuevo. `npm
   run lint` debe pasar. Commit solo cuando el verifier pasa 100%.

#### Anti-patrones explícitos (vistos en prod)
- ❌ Escribir código antes del spec → bugs que se ven en prod.
- ❌ Tostadas que mienten ("guardado" cuando solo se guardó en localStorage).
- ❌ Endpoints sin timeout → el server se cuelga para siempre.
- ❌ Modales que se cierran antes del POST → el user piensa que falló.
- ❌ Errores que devuelven HTML en vez de JSON → el frontend tira SyntaxError.
- ❌ Modificar el verifier para que pase.

#### Aplicación a los wizards actuales (julio-2026)
Por cada wizard roto, vamos a:
1. Escribir `docs/specs/wizard_{X}.md` (qué DEBE hacer)
2. Escribir `tests/verifiers/wizard_{X}.md` (cómo verificar)
3. Correr el verifier contra prod (esperamos que FALLE en varios puntos)
4. Fijar los fallos uno a uno, corriendo el verifier después de cada uno
5. Commit + push solo cuando el verifier pasa 100%

Orden de aplicación: `wizard_property` (más roto) → `wizard_tenant`
→ `wizard_contract` → `wizard_inventory` → `wizard_billing`.

### "Guardar avance (este equipo)" — wizard pre-crea propiedad en MySQL al pasar a step 2
- **Opción B (julio-2026)**: el botón "💾 Guardar avance (este equipo)" en
  step 1 SÍ persiste al servidor. Al hacer click (o al pasar a step 2 vía
  "Continuar a Documentación"), se hace un `POST /api/properties` con
  `status='Pendiente'` y se guarda el `propertyDbId` real en state.
- Esto habilita que las uploads a Drive en step 2 sean en **tiempo real**:
  cada PDF que sube el agente va directo a la carpeta de Drive de la
  propiedad, con el badge 🟢 "En Drive" apenas termina.
- **Función clave**: `ensurePropertyPersisted()` en `PropertiesView.tsx:721`
  — es idempotente. Si la propiedad ya está persistida, devuelve los IDs
  cacheados sin hacer otro POST. Si no, valida campos mínimos y la crea.
- **Inventario**: el `StepInventory` sigue usando `wizardPropertyId` (temp)
  como propertyId. El re-key a UUID real se hace en `handleFinalize` (igual
  que antes — el cambio no rompe este flujo).
- **Finalizar**: `handleFinalize` ya NO crea la propiedad (asume que existe).
  Solo sube el inventario a Drive + actualiza el status a 'Activo' si hay
  mandato firmado, o lo deja en 'Pendiente'.
- **Descartar borrador**: `discardDraft` ahora hace `DELETE /api/properties/:id`
  si la propiedad fue pre-creada. El endpoint ya limpia la carpeta de Drive
  si está vacía, y devuelve 409 si ya tiene inventarios (en cuyo caso solo
  limpiamos el state local).
- **Implicación de testing**: la propiedad aparece en MySQL apenas se llega
  a step 2. Si el agente cierra el wizard sin hacer "Descartar borrador" o
  "Finalizar", queda una fila `Pendiente` huérfana. **Mitigación**: un
  endpoint `GET /api/properties?status=Pendiente&olderThan=7d` te lista los
  huérfanos para revisarlos manualmente (TODO: agregar). Auto-cleanup con
  cron después de 30 días: pendiente de discutir.
- **Draft restoration**: el `wizardPropertyDbId` se guarda en el draft de
  localStorage. Si el user cierra el browser y vuelve, la propiedad sigue
  en MySQL y el wizard se reconecta a ella sin re-crear.

### Estados de almacenamiento de documentos (wizard) — siempre honestos
- Cada card de documento en `StepDocs` muestra un **badge explícito de estado**:
  - 🟢 **En Drive** (verde, `CheckCircle2`): todos los archivos del slot ya están
    en Google Drive (URL `https://drive.google.com/...`).
  - 🟠 **Pendiente → Drive** (amber, `CloudUpload`): el archivo existe solo como
    `blob:` URL local — porque Drive está desconectado o porque la subida a
    Drive falló. Reintentá al finalizar o reconectá Drive.
  - ⚪ vacío: el slot todavía no tiene archivos.
- El estado se deriva de la URL real del archivo (`getDocStorageState` en
  `StepDocs.tsx:13-22`). NO hay un "mentiroso" toast: el badge y el texto
  debajo del título siempre coinciden con el estado real del storage.
- Al finalizar el wizard, `PropertiesView.handleFinalize` arma un **modal de
  resumen** (`finalizeSummary` state, modal en `PropertiesView.tsx:1914+`) que
  lista explícitamente: en Drive / solo local / faltantes / errores. NO se
  auto-dismiss — el usuario decide cuándo cerrarlo. Botón "Ver carpeta en
  Drive" si hubo uploads exitosos.

