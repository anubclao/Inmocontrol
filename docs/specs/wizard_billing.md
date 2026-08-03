# Feature: Wizard de Billing (Policy + Amortización + Cuentas de Cobro + Pagos)

> **Karpathy Spec** — Julio 2026. Define QUÉ debe hacer el flujo de
> billing de InmoControl. NO incluye código de implementación.
> Una vez aprobado, sigue `tests/verifiers/wizard_billing.md`.

> **Contexto**: el billing de InmoControl tiene 5 flujos principales:
> (1) configurar la `BillingPolicy` de una propiedad, (2) generar la
> tabla de amortización, (3) enviar cuentas de cobro mensuales al
> inquilino, (4) registrar pagos, (5) generar el estado de cuenta
> del propietario. Este spec cubre los 5.

## 1. User Story

**As a** agente inmobiliario de InmoControl,
**I want to** configurar el billing de una propiedad en un flujo unificado (Policy → Amortización → Cuentas de Cobro → Pagos → Estado de Cuenta del Propietario),
**So that** la facturación mensual sea automática y consistente, las cuentas de cobro lleguen al inquilino con el PDF correcto, los pagos se registren con mora automática, y el propietario reciba su estado de cuenta mensual.

## 2. Conceptos clave

### 5 flujos principales

| Flujo                                | Cuándo                                                        | Output                                             |
| ------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------- |
| **Configurar Policy**                | Wizard post-Inventario de Colocación o manual en BillingPanel | `billing_policies` row + primera amortización      |
| **Generar Amortización**             | Una vez por contrato (se regenera solo si hay cambios)        | `amortization_rows` con N meses                    |
| **Enviar Cuenta de Cobro**           | Mes a mes, manual del agente                                  | PDF + `rent_invoices.sent_at` + `invoice_number`   |
| **Registrar Pago**                   | Cuando el inquilino paga (total o parcial)                    | `amortization_rows.paid_at` + `paid_amount` + mora |
| **Estado de Cuenta del Propietario** | Mensual                                                       | Resumen ejecutivo + transferencias reales + PDF    |

### Orden legal del flujo

1. Propiedad con mandato firmado (status='Activo').
2. Crear tenant (status='En Colocación').
3. Firmar Inventario de Colocación (status='Arrendado' + contrato 'active').
4. **Configurar BillingPolicy** (este spec).
5. **Generar Amortización** (este spec).
6. Mes a mes: **Enviar Cuenta de Cobro** (este spec).
7. Cuando paga el inquilino: **Registrar Pago** (este spec).
8. Mes a mes: **Estado de Cuenta del Propietario** (este spec).

## 3. Acceptance Criteria (numerados, binarios)

### Configurar Policy (BillingSetupWizard + BillingPolicyForm)

#### AC-1: Wizard se dispara al firmar Inventario de Colocación

- Cuando se firma el Inventario de Colocación (que crea el contrato `active`), se abre el `BillingSetupWizard`.
- **Si la propiedad YA tiene `BillingPolicy`** (consultado al server al abrir): el wizard se abre normalmente pero el botón "Guardar y generar amortización" está `disabled` y muestra `connected=true`. El agente puede cerrar con "Más tarde" o ver la policy existente.
- **Si NO tiene**: el wizard se abre con el botón enabled y los valores pre-rellenados (canon + admin del contrato).

#### AC-2: El wizard muestra el estado real de la Policy

- Si el server tiene policy persistida → `connected=true` y el botón "Guardar y generar amortización" está disabled (porque ya existe).
- Si NO tiene → el botón está enabled.

#### AC-3: El wizard es de 1 paso consolidado

- 3 secciones visuales: Canon y administración, Reglas de mora, IPC anual.
- Botones "Más tarde" (cierra sin guardar) y "Guardar y generar amortización".
- Resumen en vivo abajo: "Canon $X + Admin $Y = $Z/mes".

#### AC-4: El wizard valida los campos antes de enviar

- `rentAmount >= 0`, `adminFee >= 0`.
- `graceDay` entre 1 y 28.
- `lateFeeMidPct` y `lateFeeLatePct` entre 0 y 50.
- `expectedIpcPct` entre 0 y 20 (si `applyAnnualIpc` es true).

#### AC-5: Al confirmar → saveBillingPolicy + getOrGenerateAmortization

- POST a `/api/billing/policies/:propertyId` con el body.
- POST a `/api/billing/amortization/generate` con la policy + el contract.
- Si AMBOS responden 200 → toast "✓ Billing configurado. N meses de amortización generados."
- Si falla cualquiera → toast de error + modal NO se cierra.

#### AC-6: El wizard también se puede disparar desde el BillingPanel

- Si la propiedad NO tiene policy, el BillingPanel muestra un banner ámbar "Esta propiedad no tiene política de facturación".
- Click en el banner → abre el mismo wizard.
- Al confirmar en el wizard → recarga policy + amortización en el panel.

### Generar Amortización (AmortizationTable + API)

#### AC-7: La amortización se genera UNA vez por contrato

- Se ejecuta `getOrGenerateAmortization(contract, policy)` que devuelve las filas existentes o las genera.
- La cantidad de meses se calcula: `(endDate - startDate) / 30 días` redondeado hacia arriba (mínimo 12).

#### AC-8: Cada fila tiene los campos calculados

- `periodStart`, `periodEnd`, `dueDate` (basado en `graceDay`).
- `baseRent`, `baseAdmin`, `subtotal`.
- `ipcAdjustment`, `adminAdjustment` (si aplica).
- `total`, `totalEarly`, `totalMid`, `totalLate` (varía según día de pago).
- `status`: `pending | partial | paid | overdue`.
- `paid_at`, `paid_amount` (nulos si no se pagó).

#### AC-9: La tabla de amortización se muestra en el BillingPanel

- Una fila por mes, con columnas: Período, Canon, Admin, Subtotal, Mora, Total, Estado, Acciones.
- Botones por fila:
  - "Enviar CC" si status=pending.
  - "Marcar pagado" si sentAt existe y status != paid.
  - "Ver recibo" si status=paid.

### Enviar Cuenta de Cobro (AmortizationTable → cuentaCobroPdf)

#### AC-10: El botón "Enviar CC" abre el flujo de envío

- POST a `/api/billing/invoices/send` con `{ propertyId, contractId, period }`.
- El server genera el PDF con `cuentaCobroPdf.ts` y lo sube a `Recibos/{nombre}/` en Drive del inquilino.
- Genera el `invoice_number` con formato `CC-YYYYMM-NNN` (idempotente).
- Toast: "✓ Cuenta de cobro enviada: CC-202607-001".
- La fila de amortización se marca con `sentAt`.

#### AC-11: El consecutivo `invoice_number` es idempotente

- Re-enviar la misma cuenta de cobro devuelve el mismo `invoice_number` (no incrementa).
- Scoped por `(property_id, period)`.

#### AC-12: El PDF de cuenta de cobro tiene formato colombiano

- "DEBE A" = nombre del INQUILINO.
- "OBJETO" = canon + admin + número de contrato.
- Datos de consignación = `BillingPolicy.bankAccounts[primary]`.
- Valor en letras via `numeroAPesosColombianosCaps` ("PESOS M/CTE").
- Layout clásico de cuenta de cobro colombiana.

#### AC-13: El PDF se descarga localmente Y se sube a Drive

- El PDF se descarga al browser del agente (siempre, incluso si Drive falla).
- Se sube a Drive `Recibos/{nombre}/` (best-effort: si Drive falla, toast warning, no error).

### Registrar Pago (PaymentModal)

#### AC-14: El botón "Marcar pagado" abre el PaymentModal

- El modal pide: día del mes de pago (1-30) + monto total.
- Valida: día entre 1 y 30.
- Valida: monto > 0.

#### AC-15: Al confirmar, se calcula la mora automáticamente

- Si `dayOfMonth <= graceDay` (default 10) → `total = totalEarly` (sin mora).
- Si `graceDay < dayOfMonth <= 20` → `total = totalMid` (mora = `totalMid - totalEarly`).
- Si `dayOfMonth > 20` → `total = totalLate` (mora = `totalLate - totalEarly`).

#### AC-16: El pago se registra en la fila de amortización

- POST a `/api/billing/payments` con `{ contractId, rowId, paidOnDayOfMonth, paidAmount }`.
- El server actualiza `amortization_rows`:
  - `status='paid'` si monto >= total.
  - `status='partial'` si monto < total.
  - `paid_at = NOW()`.
  - `paid_amount = monto`.

#### AC-17: Al pagar el mes N, se desbloquea el mes N+1

- El mes siguiente al pagado puede ser enviado (botón "Enviar CC" enabled).
- Antes de pagar el mes N, el mes N+1 tiene un candado 🔒 + tooltip "Pagá el mes anterior para habilitar".

#### AC-18: Toast honesto de pago

- Éxito: "✓ Pago registrado: $X el día Y del mes Z".
- Error: "Error al registrar el pago: ${error}".
- Modal NO se cierra en error.

### Estado de Cuenta del Propietario (EstadoCuentaView)

#### AC-19: El estado de cuenta se muestra en el BillingPanel

- Una sección por propiedad con el período actual.
- Resumen ejecutivo: ingresos cobrados, gastos aplicados, retenciones, neto calculado.
- Tabla de detalle: cada movimiento (cobro, pago, descuento, etc.).
- Tabla de transferencias reales (de `owner_payouts`).

#### AC-20: El cálculo teórico viene de `calculateMonthlySettlement`

- NETO CALCULADO = canon + admin - comisión - retenciones - descuentos.
- Se muestra como referencia vs las transferencias reales.

#### AC-21: Las transferencias reales vienen de `owner_payouts`

- Cada fila: fecha, monto, banco, referencia, notas.
- Si hay 0 payouts, mostrar "Sin transferencias registradas este período".

#### AC-22: El botón "Descargar PDF" genera el estado de cuenta

- POST a `/api/billing/owner-statement?propertyId=X&period=YYYY-MM` con el body consolidado.
- El server genera el PDF con `estadoCuentaPdf.ts`.
- El PDF replica el modelo `modelo-estado-de-cuenta.pdf` adaptado:
  - Sección 5 (clasificación por antigüedad) OMITIDA.
  - Sección 6 (instrucciones de pago) → datos del PROPIETARIO.
  - Sección 8 (firmas) → Elaboró / Aprobó / Recibido por propietario.

#### AC-23: El PDF se sube automáticamente a Drive

- Después de generar el PDF localmente, se sube a `Propietario/EstadosCuenta/` en Drive.
- Si Drive falla, el PDF se descarga local igual (no rompe el flujo).
- Toast: "✓ Estado de cuenta descargado. Subido a Drive: Propietario/EstadosCuenta/."

### Descuentos y Aumentos (NovedadFormModal + IncreaseFormModal)

#### AC-24: Descuentos al propietario

- Modal `NovedadFormModal` con `chargedTo='owner'`.
- Campos: tipo, descripción, monto, mes del período.
- POST a `/api/property-discounts` o `/api/property-charges` (verificar endpoint actual).
- Aparece en el Estado de Cuenta del Propietario.

#### AC-25: Aumentos al inquilino (IPC anual)

- Modal `IncreaseFormModal` con `type='ipc_annual'`.
- Campos: descripción, monto, effective_from (YYYY-MM).
- POST a `/api/rent-increases`.
- Se refleja en la amortización del mes `effective_from` en adelante.

#### AC-26: Validación de campos

- Monto > 0.
- effective_from es YYYY-MM válido.
- Descripción no vacía.

### Timeouts y errores

#### AC-27: Top-level try/catch + JSON errors

- Cualquier error no manejado devuelve JSON con `{ error: "..." }` y status 500.
- NUNCA devuelve HTML.

#### AC-28: Drive operations timeout 8s server-side

- `oauth2Client.refreshAccessToken()` tiene timeout 8s.
- `drive.files.list/create/update` tienen timeout 8s.
- Si Drive está caído o token expirado → server devuelve 503 con error específico.

#### AC-29: Cliente timeout 15s via AbortController

- Cada `fetch` al server tiene AbortController de 15s.
- Si el server no responde → AbortController aborta, toast "El servidor tardó demasiado".

#### AC-30: El botón "Generar" se deshabilita durante la subida

- Spinner + "Generando…" durante la subida a Drive o al server.
- Doble click prevention.

## 4. Edge Cases

### EC-1: El server está caído al generar la amortización

- Toast de error claro. La policy SÍ se guarda (si la primera llamada respondió).
- La amortización se puede regenerar después con "Regenerar amortización" en el BillingPanel.

### EC-2: La policy tiene campos inválidos (ej: graceDay=0)

- Validación en el cliente (AC-4). El server también valida (defensa en profundidad).
- Toast de error claro.

### EC-3: El agente hace click 2 veces rápido en "Enviar CC"

- El botón se deshabilita durante el POST. El server es idempotente (`invoice_number` no se duplica).

### EC-4: El día de pago es 31 (no existe en todos los meses)

- El cliente lo rechaza: "Día debe estar entre 1 y 30".
- El server lo acepta pero calcula como si fuera 30 (límite del mes).

### EC-5: El pago es parcial (monto < total)

- Se registra como `status='partial'` con `paid_amount = monto`.
- El resto queda pendiente.

### EC-6: El agente paga el mes N+1 sin pagar el N

- El server lo permite (no es un bloqueo técnico, solo UX).
- El botón "Enviar CC" del mes N+1 SÍ está bloqueado por UX (candado 🔒) hasta que el mes N esté `paid`.

### EC-7: La amortización no incluye el IPC del primer año

- El IPC se aplica a partir del mes 13 (aniversario del contrato).
- El wizard puede configurar el % esperado pero el server lo aplica solo después del aniversario.

### EC-8: El descuento al propietario es MAYOR que el neto

- El servidor permite el descuento pero el neto del propietario queda negativo.
- Toast warning: "Este descuento deja el neto del propietario en negativo. Verificá los datos."

### EC-9: El agente quiere ver el estado de cuenta de un período pasado

- El selector de período en el `EstadoCuentaView` permite cambiar.
- Default: período actual (YYYY-MM).
- Si no hay movimientos en el período → mostrar "Sin movimientos este período".

### EC-10: El PDF de cuenta de cobro NO se genera (Drive falla, etc.)

- El POST devuelve 500 con error específico.
- Toast: "No se pudo generar la cuenta de cobro. Reintentá."

### EC-11: El agente sube un comprobante de pago (foto/PDF)

- AC-16 actual: solo se guarda `paid_amount` y `paid_at`. **No hay attachment**.
- Out of scope: subir comprobante. Si se necesita, se puede agregar al modal.

## 5. Technical Contract

### Endpoint: POST /api/billing/policies/:propertyId

```typescript
// Request: BillingPolicy en camelCase
interface SaveBillingPolicyRequest {
  propertyId: string;
  rentAmount: number;
  adminFee: number;
  lateFeeMidPct: number;
  lateFeeLatePct: number;
  graceDay: number;
  applyAnnualIpc: boolean;
  expectedIpcPct: number;
  applyIpcToAdmin: boolean;
  allowAdminChanges: boolean;
  bankAccounts?: BankAccount[];
  primaryBankAccountId?: string;
  policy?: PolicyInfo;
}

// Response 200: { policy: BillingPolicy }
// Response 400: { error }
```

### Endpoint: POST /api/billing/amortization/generate

```typescript
// Request: { contract: Contract, policy: BillingPolicy }
// Response 200: { rows: AmortizationRow[] }
```

### Endpoint: POST /api/billing/invoices/send

```typescript
// Request: { propertyId, contractId, period }
// Response 200: { fileId, webViewLink, invoiceNumber }
// Response 400: { error }
```

### Endpoint: POST /api/billing/payments

```typescript
// Request: { contractId, rowId, paidOnDayOfMonth, paidAmount }
// Response 200: { row: AmortizationRow }
// Response 400: { error }
```

### Endpoint: GET /api/billing/owner-statement?propertyId=X&period=YYYY-MM

```typescript
// Response 200: { statement: { summary, movements, payouts }, pdfBase64?, webViewLink? }
```

### Componentes del cliente (props relevantes)

```typescript
interface BillingPanelProps {
  property: Property;
  contracts: Contract[];
  tenants?: Array<{
    id: string;
    name: string;
    documentId?: string;
    driveFolderId?: string;
  }>;
  userName: string;
  onBack: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

interface BillingSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
  contract: Contract;
  onSuccess?: (policy: BillingPolicy) => void;
}

interface PaymentModalProps {
  row: AmortizationRow;
  policy: BillingPolicy;
  onClose: () => void;
  onConfirm: (day: number, total: number) => Promise<void>;
}
```

## 6. Timeouts (explícitos)

| Capa    | Operación                               | Timeout                 |
| ------- | --------------------------------------- | ----------------------- |
| Server  | `oauth2Client.refreshAccessToken()`     | 8s                      |
| Server  | `drive.files.list`                      | 8s                      |
| Server  | `drive.files.create`                    | 8s                      |
| Server  | `pool.query()` (MySQL)                  | sin timeout             |
| Cliente | `fetch('/api/billing/*')`               | 15s via AbortController |
| Cliente | `fetch('/api/billing/invoices/send')`   | 30s (PDF + Drive)       |
| Cliente | `fetch('/api/billing/owner-statement')` | 30s (PDF grande)        |

## 7. Tostadas exactas (copy approved — NO improvisar)

| Trigger            | Tipo    | Copy exacto                                                                     |
| ------------------ | ------- | ------------------------------------------------------------------------------- |
| AC-5 setup OK      | success | `✓ Billing configurado. N mes(es) de amortización generados.`                   |
| AC-5 setup error   | error   | `Error al guardar: ${error}. Reintentá en unos segundos.`                       |
| AC-5 ya existe     | success | `Esta propiedad ya tiene política de facturación.`                              |
| AC-10 CC enviada   | success | `✓ Cuenta de cobro enviada: ${invoiceNumber}`                                   |
| AC-10 CC error     | error   | `Error al enviar la cuenta de cobro: ${error}`                                  |
| AC-16 pago OK      | success | `✓ Pago registrado: $${monto} el día ${day}`                                    |
| AC-16 pago error   | error   | `Error al registrar el pago: ${error}`                                          |
| AC-23 EC OK        | success | `✓ Estado de cuenta descargado. Subido a Drive: Propietario/EstadosCuenta/.`    |
| AC-23 EC error     | warning | `PDF descargado localmente. No se pudo subir a Drive.`                          |
| AC-24 descuento OK | success | `✓ Descuento registrado: $${monto}`                                             |
| AC-25 aumento OK   | success | `✓ Aumento registrado: $${monto} efectivo desde ${effectiveFrom}`               |
| AC-29 timeout      | error   | `El servidor tardó demasiado. Reintentá en unos segundos.`                      |
| Drive warning      | warning | `[Drive] getFreshDriveClient falló (continuando sin Drive): ${error}` (console) |

## 8. Dependencias

### Archivos a modificar (potencialmente)

- `src/features/billing/components/BillingSetupWizard.tsx` (existente, ampliar)
- `src/features/billing/components/BillingPolicyForm.tsx` (existente)
- `src/features/billing/components/AmortizationTable.tsx` (existente)
- `src/features/billing/components/PaymentModal.tsx` (existente)
- `src/features/billing/components/EstadoCuentaView.tsx` (existente)
- `src/features/billing/components/NovedadFormModal.tsx` (existente)
- `src/features/billing/components/IncreaseFormModal.tsx` (existente)
- `src/features/billing/views/BillingPanel.tsx` (existente, integrar todo)
- `src/features/billing/views/BillingView.tsx` (existente)
- `src/features/billing/cuentaCobroPdf.ts` (existente)
- `src/features/billing/estadoCuentaPdf.ts` (existente)
- `server/routes/billing.ts` (existente, chequear que cumple los endpoints)

### Archivos a NO tocar (out of scope)

- `db/mysql/schema-hostinger.sql` (todas las tablas necesarias ya existen).
- `src/features/contracts/*` (los contratos se manejan en su propio wizard).
- `src/features/properties/*` (las propiedades se manejan en wizard_property).
- `src/features/tenants/*` (los tenants se manejan en wizard_tenant).

## 9. Out of Scope

- **PSP real (Wompi/MercadoPago)**: el `saas-billing` ya tiene PSP mock. Esto es billing de PROPIEDADES, no SaaS.
- **Pagos recurrentes automáticos**: el agente debe marcar el pago manualmente.
- **Notificaciones al inquilino por email/WhatsApp cuando se envía la CC**: el agente puede hacerlo manualmente. Out of scope.
- **Multi-moneda**: solo COP.
- **Multi-idioma**: solo español de Colombia.
- **Generación de recibos de pago (PDF)**: cuando el inquilino paga, no se genera un PDF de recibo. Solo se actualiza la fila de amortización. **Decisión a tomar**: ¿agregar generación de PDF de pago?
- **Subida de comprobantes de pago**: AC-16 actual no lo soporta. Out of scope.

## 10. Riesgos identificados

- **Tamaño de la amortización**: 12 meses × 5KB por fila = 60KB. OK. 24 meses × 5KB = 120KB. OK.
- **Tamaño del PDF de cuenta de cobro**: ~100-200KB. OK.
- **Tamaño del PDF de estado de cuenta**: 200-500KB. OK.
- **Race condition entre pagos**: 2 agentes marcando el mismo mes al mismo tiempo. El server es idempotente (`paid_amount` se sobreescribe con el último). Riesgo bajo.
- **Cambio de policy después de generar amortización**: si el agente cambia la policy (mora, IPC, etc.), la amortización NO se regenera automáticamente. El agente debe hacer click en "Regenerar amortización" manualmente.
- **PDF del estado de cuenta sin Drive**: si Drive está caído, el PDF se descarga local pero no se sube. El agente debe subirlo manualmente después.

## 11. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03 (AC-1 alineado con AC-2: wizard abre con botón disabled si ya hay policy, no se cierra)
