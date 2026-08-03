# Bugs Catalog — InmoControl (Aug 2026)

> Catálogo de bugs encontrados durante el code review del 2026-08-03.
> Cada bug tiene un ID (`BUG-NNN`), severidad, archivo:línea, descripción,
> causa raíz, impacto y plan de fix. Los IDs son estables — no se renumeran.
>
> **Origen**: code review cruzado (3 sub-agents en paralelo) + Fase Roja de
> los 5 verifiers PowerShell contra `https://inmocontrol.tecnowebsupportia.com`.
>
> **Convención de severidad** (alineada con Karpathy):
>
> - 🔴 **Alta** — rompe funcionalidad core, pérdida/duplicación de datos, o estado financiero incorrecto
> - 🟡 **Media** — comportamiento incorrecto en edge cases, fugas de memoria, race conditions, timeouts faltantes
> - 🟢 **Baja** — UX subóptima, código duplicado, warnings, validación faltante en rama fría

## Resumen ejecutivo

| Categoría                  | 🔴 Alta | 🟡 Media | 🟢 Baja | Total  |
| -------------------------- | :-----: | :------: | :-----: | :----: |
| Backend (server/routes/\*) |    2    |    13    |    3    |   18   |
| Frontend (src/\*\*)        |    2    |    8     |    2    |   12   |
| DB / migrations            |    —    |    2     |    4    |   6    |
| Build / config             |    —    |    1     |    1    |   2    |
| **TOTAL**                  |  **4**  |  **24**  | **10**  | **38** |

**Estado por ola de fix:**

| Ola                   | Bugs              | Status                                                    |
| --------------------- | ----------------- | --------------------------------------------------------- |
| 🟥 Ola 1 (críticos)   | BUG-001 a BUG-005 | 🟡 3/5 fixed (005 en próximo commit), 3/5 specs aprobados |
| 🟨 Ola 2 (calidad)    | BUG-006 a BUG-029 | ⏳ Pendiente                                              |
| 🟦 Ola 3 (cleanup DB) | BUG-030 a BUG-035 | ⏳ Pendiente                                              |

---

## 🟥 Ola 1 — Críticos (fix inmediato)

### BUG-001: CORS no permite `PATCH` en producción

- **Severidad**: 🔴 Alta
- **Archivo**: [server.ts:52](server.ts#L52)
- **Síntoma**: `PATCH /api/contracts/:id` y `PATCH /api/properties/:id` devuelven error de CORS en el browser cuando el agente intenta editar un contrato o propiedad. **Funciona en dev, falla en prod**.
- **Causa raíz**: El array `methods` en la config de CORS omite `PATCH`. La rama `process.env.NODE_ENV !== 'production'` bypasea la verificación de origin en dev, por eso pasa.
- **Impacto**: Imposible editar contratos o propiedades en producción. Workaround: el usuario tiene que hacer DELETE+CREATE en vez de PATCH.
- **Fix plan**: agregar `'PATCH'` al array de `methods` en la línea 52 de `server.ts`.
- **Spec**: No requiere (1 token). Verificación: `curl -X PATCH` desde browser en prod devuelve 200.
- **Effort**: < 5 min.

### BUG-002: `commission_percentage` debería ser `commission_pct`

- **Severidad**: 🔴 Alta (financiera)
- **Archivo**: [server/routes/billing.ts:1243](server/routes/billing.ts#L1243)
- **Síntoma**: El PDF de "Estado de Cuenta del Propietario" siempre muestra 8% de comisión porque la columna en MySQL se llama `commission_pct` (ver `db/mysql/schema-hostinger.sql:240`) pero el código lee `commission_percentage`. El fallback `?? 8` siempre aplica.
- **Causa raíz**: Typo histórico. La columna se llama `commission_pct` consistentemente en los 3 schemas (legacy, completo, hostinger).
- **Impacto**: PDFs de liquidación incorrectos. El propietario ve un monto distinto al real. Posible discrepancia contable.
- **Fix plan**: cambiar `commission_percentage` → `commission_pct` en billing.ts:1243. Verificar que no haya OTROS usos del nombre incorrecto en el resto del codebase.
- **Spec**: No requiere (1 palabra). Verificación: ejecutar `GET /api/billing/owner-statement?propertyId=X&period=YYYY-MM` con un contrato que tenga `commission_pct=10` y confirmar que el PDF muestra 10%.
- **Effort**: 5 min + verificar todo el repo.

### BUG-003: PaymentModal se cierra aunque el pago falle

- **Severidad**: 🔴 Alta
- **Archivos**:
  - [src/features/billing/views/BillingPanel.tsx:221-233](src/features/billing/views/BillingPanel.tsx)
  - [src/features/billing/components/PaymentModal.tsx:65-73](src/features/billing/components/PaymentModal.tsx)
- **Síntoma**: Si el POST a `/api/billing/payments` falla, el modal desaparece y la tabla queda inconsistente (mitad pagado / mitad no). El toast de error aparece 100ms y el modal se va.
- **Causa raíz**: `handlePay` hace `throw err;` al final del `catch`. `PaymentModal.handleConfirm` lo captura con `try { await onConfirm(...); onClose(); } finally { setSubmitting(false); }` — el `onClose()` se ejecuta también cuando `onConfirm` rechaza.
- **Impacto**: Pérdida de trazabilidad de pagos. El usuario cree que pagó, la app no registra el pago, próxima corrida del wizard el agente ve estado inconsistente.
- **Fix plan**: `handlePay` debe devolver `boolean` (`true` = OK, `false` = error). `PaymentModal.handleConfirm` decide cerrar solo si fue OK.
- **Spec**: Necesario (afecta UX de flujo crítico). Draft en `docs/specs/fix-bug-003-payment-modal.md`.
- **Effort**: 1-2 horas.

### BUG-004: Regenerar amortización revierte `paid` → `pending`

- **Severidad**: 🔴 Alta (financiera)
- **Archivo**: [server/routes/billing.ts:245-268](server/routes/billing.ts) — `POST /api/billing/amortization/generate`
- **Síntoma**: Si el usuario regenera la amortización (porque cambió la policy, IPC anual, etc.) DESPUÉS de marcar pagos, las filas pagadas vuelven a `status='pending'`. Se pierde el `paid_at`/`paid_amount` (el `ON DUPLICATE KEY UPDATE` incluye `status = VALUES(status)`, y `generateAmortization()` siempre emite `status='pending'`).
- **Causa raíz**: Falta preservar el estado `status` actual de filas ya pagadas. El UPSERT pisa `status` siempre.
- **Impacto**: Pérdida silenciosa de trazabilidad de pagos. La amortización muestra `pending` aunque el cliente ya pagó. Genera quejas y disputas.
- **Fix plan**: en el `ON DUPLICATE KEY UPDATE`, NO pisar `status`, `paid_at`, `paid_amount`. Solo actualizar `total_early/mid/late` si la policy cambió. Alternativa: hacer UPDATE separado para filas pagadas con su status preservado.
- **Spec**: Necesario (afecta lógica financiera core). Draft en `docs/specs/fix-bug-004-regenerate-amortization.md`.
- **Effort**: 2-3 horas (incluye test de regression).

### BUG-005: `useEffect` con `[]` deps en auto-fill de ContractsView

- **Severidad**: 🔴 Alta
- **Archivo**: [src/features/contracts/ContractsView.tsx:401-420](src/features/contracts/ContractsView.tsx)
- **Síntoma**: Si la lista de `tenants` o `properties` se hidrata DESPUÉS de que el modal abre (caso típico: Zustand `appStore.hydrate()` termina post-mount), el `useEffect` ya pasó, no se re-dispara, y el modal muestra `rentAmount: 0, adminFee: 0` aunque el tenant ya tiene canon configurado.
- **Causa raíz**: `useEffect(() => {...}, [])` con `eslint-disable-next-line react-hooks/exhaustive-deps`. El efecto lee `tenants`, `properties`, `form.propertyId` pero solo depende de nada.
- **Impacto**: Wizard de captación: el agente tiene que tipear el canon a mano y queda desfasado del contrato real. Posible error humano (transcribe mal).
- **Fix plan**: cambiar deps a `[form.propertyId, tenants, properties]`. Usar `setForm` con función updater para no stale-closure.
- **Spec**: Necesario (afecta UX de captación). Draft en `docs/specs/fix-bug-005-contracts-autofill.md`.
- **Effort**: 1 hora.

---

## 🟨 Ola 2 — Calidad (sprint de calidad)

### Backend

#### BUG-006: `ensureDefaultOrg()` fuera del `try` en billing.ts (2 endpoints)

- **Severidad**: 🟡 Media
- **Archivos**: [server/routes/billing.ts:165-166, 214-215](server/routes/billing.ts)
- **Síntoma**: Si `ensureDefaultOrg()` falla (schema drift, MySQL caído, FK corrupta), Express agarra con default handler y devuelve HTML 500. Frontend tira `SyntaxError`.
- **Fix plan**: mover la llamada DENTRO del `try`. Patrón: `try { const orgId = await ensureDefaultOrg(); ... }`.
- **Effort**: 10 min.

#### BUG-007: Race condition en `generateInvoiceNumber`

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/billing.ts:825-841](server/routes/billing.ts)
- **Síntoma**: `SELECT COUNT(*) + 1` no es atómico. Dos POSTs simultáneos a `/invoices/send` (mismo property + period) leen el mismo `n` y graban el mismo `invoice_number`.
- **Fix plan**: agregar UNIQUE constraint en `rent_invoices.invoice_number` (migration 011) + usar `INSERT ... ON DUPLICATE KEY UPDATE` en vez de COUNT+1. O usar un counter table.
- **Effort**: 2 horas (incluye migration + test).

#### BUG-008: `markInvoicePaid` puede fallar → estado inconsistente

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/billing.ts:296-340 + 261-326](server/routes/billing.ts)
- **Síntoma**: El handler hace `UPDATE amortization_rows` (commit) y después llama `markInvoicePaid()` que hace su propio UPDATE/INSERT en `rent_invoices`. Si el segundo falla, la amortización muestra pagada pero la cuenta de cobro no.
- **Fix plan**: envolver en transacción (`pool.getConnection()` + `beginTransaction/commit/rollback`).
- **Effort**: 1 hora.

#### BUG-009: Doble-click en "Crear tenant" puede duplicar carpeta Drive

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/tenants.ts:140-181](server/routes/tenants.ts)
- **Síntoma**: La carpeta del inmueble chequea si ya existe, pero la del tenant NO. POSTs concurrentes crean 2 carpetas con el mismo nombre.
- **Fix plan**: agregar chequeo de existencia antes de `drive.files.create` (igual que la del inmueble). O agregar UNIQUE en el path de la carpeta.
- **Effort**: 30 min.

#### BUG-010: `propertyAddress` sin type-check en tenants.ts

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/tenants.ts:119](server/routes/tenants.ts)
- **Síntoma**: Sin runtime check. `properties.ts` hace `String(address).replace(...)`, este no. Inconsistencia.
- **Fix plan**: aplicar el mismo pattern de escape que `properties.ts:277`.
- **Effort**: 10 min.

#### BUG-011: PATCH `/api/contracts/:id` no valida NADA del body

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/entities.ts:319-365](server/routes/entities.ts) (no existe `contracts.ts` separado)
- **Síntoma**: `status` no se valida contra enum, `startDate`/`endDate` no se validan, `rentAmount` puede ser negativo, FK violations devuelven 500.
- **Fix plan**: agregar validador central (helper `validateContractPatch`). Defensa en profundidad.
- **Effort**: 1-2 horas.

#### BUG-012: DELETE contract sin chequeo de dependencias

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/entities.ts:230-255](server/routes/entities.ts)
- **Síntoma**: Si el contrato tiene `amortization_rows`, MySQL tira FK violation con mensaje técnico. Debería ser 409 con mensaje accionable.
- **Fix plan**: try/catch específico para `ER_ROW_IS_REFERENCED_2` → 409.
- **Effort**: 30 min.

#### BUG-013: `ensureDefaultOrg()` fuera del `try` en inventories.ts

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/inventories.ts:98-153](server/routes/inventories.ts)
- **Síntoma**: Mismo patrón que BUG-006.
- **Fix plan**: mover dentro del `try`.
- **Effort**: 10 min.

#### BUG-014: Inventories upload-pdf sin try/catch en Drive

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/inventories.ts:215-281](server/routes/inventories.ts)
- **Síntoma**: `drive.files.create`, `drive.permissions.create`, `UPDATE properties` sin try/catch. Si Drive cuelga, HTML 500.
- **Fix plan**: envolver llamadas a Drive con try/catch + `withTimeout`. Patrón ya existe en `tenants.ts`.
- **Effort**: 1 hora.

#### BUG-015: Inventories upload-photos sin `withTimeout`

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/inventories.ts:167-203](server/routes/inventories.ts)
- **Síntoma**: Loop de uploads a Drive sin timeout. Inconsistente con `tenants.ts` y `properties.ts`.
- **Fix plan**: aplicar `withTimeout` por iteración.
- **Effort**: 30 min.

#### BUG-016: Properties.ts: creación de carpetas Drive sin `withTimeout`

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/properties.ts:273-300](server/routes/properties.ts)
- **Síntoma**: `withTimeout` está definido en este archivo pero no se usa en las llamadas a Drive. Inconsistencia.
- **Fix plan**: envolver las 2 llamadas a `drive.files.list` y `drive.files.create`.
- **Effort**: 15 min.

#### BUG-017: Properties.ts: DELETE+INSERT de owners/units sin transacción

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/properties.ts:459-463, 519-521](server/routes/properties.ts)
- **Síntoma**: Si el 3er INSERT falla, los 2 anteriores ya están commiteados. Propiedad queda con set parcial de owners.
- **Fix plan**: envolver en transacción.
- **Effort**: 1 hora.

#### BUG-018: Properties.ts: PATCH devuelve 200 aunque affectedRows=0

- **Severidad**: 🟡 Media
- **Archivo**: [server/routes/properties.ts:910-983](server/routes/properties.ts)
- **Síntoma**: Trampa silenciosa. El cliente piensa que actualizó pero no pasó nada.
- **Fix plan**: chequear `result.affectedRows` y devolver 404 si 0.
- **Effort**: 10 min.

### Frontend

#### BUG-019: `hydrate()` de appStore sin timeouts

- **Severidad**: 🟡 Media
- **Archivo**: [src/shared/store/appStore.ts:80-95](src/shared/store/appStore.ts)
- **Síntoma**: 5 endpoints en `Promise.all`. Si UNO cuelga, spinner eterno. `apiCall` tampoco tiene AbortController.
- **Fix plan**: `Promise.race([fetch, timeout(15_000)])` por cada call.
- **Effort**: 1 hora.

#### BUG-020: `addProperty` con spread `...p` pisa los defaults

- **Severidad**: 🟡 Media
- **Archivo**: [src/shared/store/appStore.ts:184-200](src/shared/store/appStore.ts)
- **Síntoma**: Si `p.address` es `undefined`, el spread `...p` al final rescribe `address: ''` con `address: undefined`. Cards renderizan `undefined` o `[object Object]`.
- **Fix plan**: mover `...p` ANTES de los defaults, o no usar spread.
- **Effort**: 15 min.

#### BUG-021: Memory leak `URL.createObjectURL` sin `revokeObjectURL`

- **Severidad**: 🟡 Media
- **Archivo**: [src/features/properties/PropertiesView.tsx:552, 622, 719, 733](src/features/properties/PropertiesView.tsx)
- **Síntoma**: blob URLs vivos en memoria toda la sesión. Cleanup final revoca `uploadedDocs` pero NO `mandateUrl`/`docUrl`.
- **Fix plan**: agregar `URL.revokeObjectURL` en cleanup de cada `viewerDoc.onClose` y al desmontar el wizard.
- **Effort**: 1-2 horas (revisar todos los useEffect cleanup).

#### BUG-022: TenantsView `handleDocUpload` sin AbortController

- **Severidad**: 🟡 Media
- **Archivo**: [src/features/tenants/TenantsView.tsx:513-540](src/features/tenants/TenantsView.tsx)
- **Síntoma**: Spinner eterno si Drive lento. Inconsistente con `handleConfirmAndCreate` que sí tiene timeout.
- **Fix plan**: AbortController 15s. Reutilizar helper si existe.
- **Effort**: 30 min.

#### BUG-023: TenantsView `handleConfirmAndCreate` sin rollback en 409

- **Severidad**: 🟡 Media
- **Archivo**: [src/features/tenants/TenantsView.tsx:426-446](src/features/tenants/TenantsView.tsx)
- **Síntoma**: Si `onUpdateProperty` falla, el tenant YA se creó, el form YA se reseteó, modal YA cerró. Toasts de éxito con error real.
- **Fix plan**: hacer el property update ANTES de cerrar el modal, con try/catch que muestre error y deje modal abierto.
- **Effort**: 1 hora.

#### BUG-024: driveService.ts sin AbortController ni timeouts

- **Severidad**: 🟡 Media
- **Archivo**: [src/lib/drive/driveService.ts](src/lib/drive/driveService.ts)
- **Síntoma**: `createPropertyFolders`, `uploadFileToDrive`, `uploadPdfToDrive` — ninguna tiene timeout. Spinner eterno.
- **Fix plan**: helper `fetchWithTimeout(url, options, 15000)` aplicado a las 3 funciones.
- **Effort**: 1 hora.

#### BUG-025: billing/api.ts `tryBackendOrFallback` miente al usuario

- **Severidad**: 🟡 Media
- **Archivo**: [src/features/billing/api.ts:80-90](src/features/billing/api.ts)
- **Síntoma**: Si server falla, cae silenciosamente a localStorage. Toast de éxito, user cree que guardó.
- **Fix plan**: propagar error al caller; el caller decide qué hacer (retry, toast error, fallback explícito).
- **Effort**: 1 hora.

#### BUG-026: StepInventory useEffect con `baseInventory` causa re-load infinito

- **Severidad**: 🟡 Media
- **Archivo**: [src/features/properties/components/StepInventory.tsx:138-144](src/features/properties/components/StepInventory.tsx)
- **Síntoma**: Si el padre pasa `baseInventory` con nueva referencia cada render, effect se re-dispara, hace `getInventory`, puede perder cambios locales no persistidos.
- **Fix plan**: memoizar `baseInventory` en el padre o usar solo `baseInventory?.id` como dep.
- **Effort**: 30 min.

### Build / config

#### BUG-027: `db/mysql/schema.sql` está obsoleto

- **Severidad**: 🟡 Media
- **Archivo**: [db/mysql/schema.sql](db/mysql/schema.sql)
- **Síntoma**: Sin columnas `inventory_*_pdf_url`, sin `property_owners/units`, sin `owner_payouts`, status en inglés. Deploy "limpio" con este archivo = app explotando 500.
- **Fix plan**: borrar o mover a `legacy/`. Actualizar AGENTS.md para apuntar a `schema-hostinger.sql` como único canónico.
- **Effort**: 5 min.

#### BUG-028: routers con mismo path `/api/billing` (orden implícito)

- **Severidad**: 🟢 Baja (no es bug funcional, es DX)
- **Archivo**: [server.ts:77, 80](server.ts)
- **Síntoma**: `banksRouter` y `billingRouter` ambos en `/api/billing`. Si ambos definen `router.get('/x')`, gana el último.
- **Fix plan**: documentar orden o consolidar en un solo router.
- **Effort**: 15 min.

#### BUG-029: Wrapper central de errores faltante

- **Severidad**: 🟡 Media (estratégico)
- **Síntoma**: 151 ocurrencias de `try/catch` repetidas en 5 archivos de routes. Cada handler repite el pattern. Frágil si crece.
- **Fix plan**: crear `server/lib/asyncHandler.ts` que envuelve handlers y propaga errores a un middleware central. Migrar gradualmente.
- **Effort**: 2-3 horas. Spec dedicado: `docs/specs/fix-bug-029-central-error-wrapper.md`.

---

## 🟦 Ola 3 — Cleanup DB / migrations

### BUG-030: Gap inicial sin `001_*.sql`

- **Severidad**: 🟢 Baja
- **Síntoma**: No existe migration 001. El "001" es `schema.sql` sin versionar.
- **Fix plan**: renumerar a 000 o documentar.
- **Effort**: 5 min.

### BUG-031: Duplicado en `006_*.sql`

- **Severidad**: 🟢 Baja
- **Síntoma**: `006_password_hash.sql` y `006_property_charges.sql` con mismo número.
- **Fix plan**: renombrar a `006a` / `006b` o reordenar a 011.
- **Effort**: 5 min.

### BUG-032: Sin UNIQUE en `rent_invoices.invoice_number`

- **Severidad**: 🟡 Media (defensa contra race condition)
- **Síntoma**: Solo índice no-único. Race del contador backend puede duplicar `CC-YYYYMM-NNN`.
- **Fix plan**: migration 011 con `ALTER TABLE rent_invoices ADD UNIQUE (invoice_number)`.
- **Effort**: 1 hora (incluye validar que no haya duplicados existentes).

### BUG-033: Sin UNIQUE en `tenants (organization_id, document_id)`

- **Severidad**: 🟡 Media
- **Síntoma**: Cédula del inquilino puede duplicarse en la misma org.
- **Fix plan**: migration 012 con `ALTER TABLE tenants ADD UNIQUE (organization_id, document_id)`.
- **Effort**: 1 hora.

### BUG-034: 3 migrations no idempotentes

- **Severidad**: 🟢 Baja
- **Síntoma**: 002, 004, 006a-password rompen en re-run. Scripts no las protegen.
- **Fix plan**: envolver con pre-check `information_schema` (patrón de 009/010).
- **Effort**: 2 horas.

### BUG-035: 2 migrations sin script apply

- **Severidad**: 🟢 Baja
- **Síntoma**: 002 y 006a-password no tienen `apply-XXX-migration.mjs`.
- **Fix plan**: crear `apply-002-migration.mjs` y `apply-006a-password-migration.mjs` (o renombrar a 011/012).
- **Effort**: 30 min cada uno.

---

## 🟢 Ola 4 — Ya fixed (histórico)

| ID          | Bug                                                     | Fix commit |
| ----------- | ------------------------------------------------------- | ---------- |
| (linter-1)  | `t.documentId` no existe en Tenant                      | `77fee39`  |
| BUG-001     | CORS no permite PATCH en prod                           | `8f5c88e`  |
| BUG-002     | `commission_percentage` (typo) → `commission_pct`       | `7c551b0`  |
| (linter-2)  | LoginScreen sin import React                            | `77fee39`  |
| (linter-3)  | `alert.entity.category` (debería ser alert.category)    | `77fee39`  |
| (linter-4)  | `Card` no acepta `key` prop                             | `77fee39`  |
| (linter-5)  | `RuleRow`/`ChannelConfigRow`/`LogRow` no aceptan `key`  | `77fee39`  |
| (linter-6)  | `TenantsView` Card key prop error                       | `77fee39`  |
| (formato-1) | `??` roto en AGENTS.md sección Karpathy                 | `b860d26`  |
| (formato-2) | `id; name;` (semicolons en object types, inválido TS)   | `53f8753`  |
| (formato-3) | Single quotes → double quotes (AlertsView)              | `d008bb6`  |
| BUG-005     | `useEffect` con `[]` deps en auto-fill de ContractsView | `bef6d1d`  |

---

## 🔄 Estado de specs (Karpathy cycle)

| Bug               |       Spec       |  Verifier   | Status              |
| ----------------- | :--------------: | :---------: | ------------------- |
| BUG-001           | ❌ (no necesita) |     ❌      | ✅ `8f5c88e`        |
| BUG-002           | ❌ (no necesita) |     ❌      | ✅ `7c551b0`        |
| BUG-003           |   ✅ Aprobado    | ✅ Aprobado | ⏳ (siguiente)      |
| BUG-004           |   ✅ Aprobado    | ✅ Aprobado | ⏳                  |
| BUG-005           |   ✅ Aprobado    | ✅ Aprobado | ✅ (próximo commit) |
| BUG-006 a BUG-029 |        ❌        |     ❌      | ⏳                  |
| BUG-030 a BUG-035 |        ❌        |     ❌      | ⏳                  |

---

## 🗓️ Roadmap sugerido (por sprint de 1 semana)

### Sprint 1 (Ola 1) — críticos

- BUG-001 (5 min)
- BUG-002 (5 min)
- BUG-003 (spec + impl + verifier, 1-2 días)
- BUG-004 (spec + impl + verifier, 1-2 días)
- BUG-005 (spec + impl + verifier, 1 día)

### Sprint 2 (Ola 2 backend) — calidad server

- BUG-006 a BUG-018 (mayormente pequeños, 1-2 días)
- BUG-029 (wrapper central, 2-3 días)

### Sprint 3 (Ola 2 frontend) — calidad cliente

- BUG-019 a BUG-026 (1 semana)

### Sprint 4 (Ola 3) — DB cleanup

- BUG-030 a BUG-035 (1-2 días)
- BUG-027 (mover schema.sql a legacy)

---

## 🛠️ Cómo usar este catálogo

### Cuando encontrás un bug nuevo

1. Asignale un ID `BUG-NNN` (siguiente número libre)
2. Agregalo a la sección que corresponda
3. Ponelo en ⏳ Pendiente

### Cuando arranqués a fixearlo

1. Si es un fix de 1 línea (1 token, 1 palabra): no necesita spec
2. Si afecta flujo: escribí `docs/specs/fix-bug-NNN-name.md` desde el template
3. Implementá
4. Escribí un verifier si el cambio no es trivial

### Cuando termines

1. Commit con `fix(BUG-NNN): descripcion corta`
2. Mover el bug a la sección "🟢 Ola 4 — Ya fixed" con referencia al commit
3. Actualizar "Estado de specs"

---

## 📚 Referencias cruzadas

- **AGENTS.md** sección "Metodología Karpathy" — workflow Spec → Verifier → Impl
- **docs/specs/TEMPLATE_feature-spec.md** — template para specs de bugfix
- **docs/env/ARCHITECTURE.md** — stack y rutas
- **docs/env/CONSTRAINTS.md** — reglas duras (no `any`, JSON on errors, timeouts)
- **tests/verifiers/wizard\_\*.md** — verifiers de los 5 wizards (no de bugs)
- **scripts/verifier-wizard-\*.ps1** — runners PowerShell que encontraron varios de estos bugs en Fase Roja

---

**Última actualización**: 2026-08-03 (code review inicial)
**Próxima revisión**: post-Sprint 1
