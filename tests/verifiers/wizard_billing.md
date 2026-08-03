# Verifier: Wizard de Billing (Policy + Amortización + Cuentas de Cobro + Pagos + Estado de Cuenta)

> **Karpathy Verifier** — Agosto 2026. Cada Acceptance Criterion de
> `docs/specs/wizard_billing.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un
> check falla, el código está mal.

> **Nota:** este verifier cubre los 30 ACs del spec. El spec está
> marcado como `Status: ⏳ Pending Review` (sección 11). Mientras el
> spec no esté aprobado, este verifier es **DRAFT** — los pasos
> pueden ajustarse si se cambia el spec.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io` (DB `u652436213_inmocontrol`)
- Browser con DevTools (F12 → Console + Network) en incógnito
- PowerShell 7+ en Windows
- Para la mayoría de los tests: una propiedad con `status='Arrendado'`,
  un tenant activo, y un contrato `active` con canon + admin definidos.

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere (adjuntar output real)
- ⚠️ **SKIP** — no verificable ahora (motivo)

### Limpiar datos de prueba

```powershell
# Pegar en phpMyAdmin → SQL antes de empezar
DELETE FROM amortization_rows WHERE contract_id IN (SELECT id FROM contracts WHERE notes LIKE 'TEST-BILLING-%');
DELETE FROM rent_invoices WHERE invoice_number LIKE 'CC-TEST-%';
DELETE FROM owner_payouts WHERE notes LIKE 'TEST-BILLING-%';
DELETE FROM property_discounts WHERE description LIKE 'TEST-BILLING-%';
DELETE FROM rent_increases WHERE description LIKE 'TEST-BILLING-%';
DELETE FROM billing_policies WHERE notes LIKE 'TEST-BILLING-%';
DELETE FROM contracts WHERE notes LIKE 'TEST-BILLING-%';
```

---

## Pre-check (ejecutar ANTES de los AC)

### PRE-1: Health check

```powershell
$h = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/health" -UseBasicParsing -TimeoutSec 10
Write-Host "Status: $($h.StatusCode)"
Write-Host $h.Content
```

**Esperado:** `200 OK` con `{"status":"ok","db":{"ok":true,...}}`

**Status:** ⏳ Pending

---

## Acceptance Criteria

### Sección 1: Configurar Policy (BillingSetupWizard + BillingPolicyForm)

#### AC-1: Wizard se dispara al firmar Inventario de Colocación

**Pasos:**

1. Hard refresh (Ctrl+Shift+R).
2. Tener una propiedad con `status='En Colocación'` y un tenant asignado.
3. Abrir el Inventario de Colocación y firmarlo (2 firmas: tenant + agente).
4. **Verificar**: al confirmar, se abre automáticamente el `BillingSetupWizard`.
5. **Verificar**: el wizard viene con valores pre-rellenados (canon y admin del contrato activo).

**Resultado esperado:**

- Modal `BillingSetupWizard` aparece sin acción manual del agente
- `rentAmount` y `adminFee` pre-rellenados desde el `Contract` activo
- Toast NO se dispara hasta confirmar

**Status:** ⏳ Pending

---

#### AC-2: El wizard muestra el estado real de la Policy

**Pasos:**

1. Para una propiedad SIN `BillingPolicy` (limpiar en phpMyAdmin).
2. Abrir el BillingPanel de esa propiedad.
3. Click en el banner ámbar "Esta propiedad no tiene política de facturación".
4. **Verificar**: el wizard se abre con botón "Guardar y generar amortización" **enabled**.
5. Cerrar. En phpMyAdmin, insertar una `billing_policies` para esa propiedad.
6. Volver a abrir el wizard.
7. **Verificar**: el botón "Guardar y generar amortización" está **disabled** (porque ya existe policy).
8. **Verificar**: toast al abrir: "Esta propiedad ya tiene política de facturación." (el wizard se cierra solo, según AC-1 sub-caso).

**Status:** ⏳ Pending

---

#### AC-3: El wizard es de 1 paso consolidado

**Pasos:**

1. Abrir el wizard en una propiedad sin policy.
2. **Verificar**: hay 3 secciones visuales en el mismo paso:
   - "Canon y administración" (rentAmount, adminFee)
   - "Reglas de mora" (graceDay, lateFeeMidPct, lateFeeLatePct)
   - "IPC anual" (applyAnnualIpc checkbox, expectedIpcPct, applyIpcToAdmin)
3. **Verificar**: hay 2 botones al pie: "Más tarde" y "Guardar y generar amortización".
4. **Verificar**: hay un resumen en vivo abajo: "Canon $X + Admin $Y = $Z/mes".
5. **Verificar**: NO hay stepper ni navegación entre steps (es 1 solo paso).

**Status:** ⏳ Pending

---

#### AC-4: El wizard valida los campos antes de enviar

**Pasos:**

1. Abrir wizard.
2. Probar `rentAmount = -1` → **Verificar**: error inline "Canon debe ser ≥ 0".
3. Probar `adminFee = -500` → **Verificar**: error inline "Administración debe ser ≥ 0".
4. Probar `graceDay = 0` → **Verificar**: error "Día de gracia debe estar entre 1 y 28".
5. Probar `graceDay = 31` → **Verificar**: error "Día de gracia debe estar entre 1 y 28".
6. Probar `lateFeeMidPct = 60` → **Verificar**: error "Mora media debe estar entre 0 y 50".
7. Probar `applyAnnualIpc = true` y `expectedIpcPct = 25` → **Verificar**: error "IPC esperado debe estar entre 0 y 20".
8. **Verificar**: el botón "Guardar" está disabled mientras haya errores.

**Status:** ⏳ Pending

---

#### AC-5: Al confirmar → saveBillingPolicy + getOrGenerateAmortization

**Pasos:**

1. Abrir wizard, llenar campos válidos, click "Guardar y generar amortización".
2. DevTools → Network → filtrar `/api/billing/`.
3. **Verificar**: 2 POSTs en orden:
   - `POST /api/billing/policies/:propertyId` (status 200)
   - `POST /api/billing/amortization/generate` (status 200)
4. **Verificar**: toast de éxito con copy exacto: `✓ Billing configurado. N mes(es) de amortización generados.` (donde N es la cantidad de filas generadas).
5. **Verificar**: el modal se cierra.

**Casos de error:** 6. DevTools → Network → Block request `/api/billing/amortization/generate`. 7. Repetir el flujo. 8. **Verificar**: la policy SÍ se guarda (primer POST responde 200). 9. **Verificar**: toast de error: `Error al guardar: ${error}. Reintentá en unos segundos.` 10. **Verificar**: el modal NO se cierra.

**Status:** ⏳ Pending

---

#### AC-6: El wizard también se puede disparar desde el BillingPanel

**Pasos:**

1. Para una propiedad sin policy, abrir el BillingPanel.
2. **Verificar**: aparece un banner ámbar arriba con texto "Esta propiedad no tiene política de facturación".
3. Click en el banner.
4. **Verificar**: se abre el mismo `BillingSetupWizard` que en AC-1.
5. Confirmar.
6. **Verificar**: el BillingPanel recarga la policy + amortización sin refresh manual.

**Status:** ⏳ Pending

---

### Sección 2: Generar Amortización (AmortizationTable + API)

#### AC-7: La amortización se genera UNA vez por contrato

**Pasos:**

1. Generar policy + amortización (AC-5) para un contrato activo.
2. Confirmar cantidad de meses: `(endDate - startDate) / 30` redondeado arriba, **mínimo 12**.
3. En phpMyAdmin: `SELECT COUNT(*) FROM amortization_rows WHERE contract_id = 'X';`
4. **Verificar**: el COUNT coincide con N del toast.
5. Volver a invocar el wizard y hacer click en "Regenerar amortización" (debe haber un botón en BillingPanel).
6. **Verificar**: la cantidad de filas NO cambia (mismo contrato, mismo rango de fechas → mismo N).

**Status:** ⏳ Pending

---

#### AC-8: Cada fila tiene los campos calculados

```powershell
# En phpMyAdmin, después de generar amortización:
SELECT period_start, period_end, due_date,
       base_rent, base_admin, subtotal,
       ipc_adjustment, admin_adjustment,
       total, total_early, total_mid, total_late,
       status, paid_at, paid_amount
FROM amortization_rows
WHERE contract_id = 'X'
ORDER BY period_start
LIMIT 3;
```

**Esperado:**

- `period_start` y `period_end` son fechas del mes correspondiente
- `due_date` = `period_start + graceDay días` (con graceDay default 10)
- `base_rent` y `base_admin` constantes durante todo el contrato (salvo IPC)
- `subtotal = base_rent + base_admin`
- `ipc_adjustment` NULL o 0 en los primeros 12 meses
- `total = subtotal` (sin mora)
- `total_early = total_mid = total_late` solo si la mora es 0%
- `status = 'pending'` para todas las filas recién generadas
- `paid_at` y `paid_amount` NULL

**Status:** ⏳ Pending

---

#### AC-9: La tabla de amortización se muestra en el BillingPanel

**Pasos:**

1. Abrir BillingPanel de una propiedad con amortización generada.
2. **Verificar**: aparece una tabla con una fila por mes, columnas:
   - Período | Canon | Admin | Subtotal | Mora | Total | Estado | Acciones
3. **Verificar**: para cada fila con `status='pending'` y SIN `sentAt` → botón "Enviar CC" enabled.
4. **Verificar**: para la primera fila del período actual → el botón "Marcar pagado" puede estar enabled (si tiene `sentAt`).
5. **Verificar**: para filas con `status='paid'` → solo label verde "✓ Pagado", sin botones.

**Status:** ⏳ Pending

---

### Sección 3: Enviar Cuenta de Cobro (AmortizationTable → cuentaCobroPdf)

#### AC-10: El botón "Enviar CC" abre el flujo de envío

**Pasos:**

1. En BillingPanel, fila de amortización con `status='pending'`, click "Enviar CC".
2. DevTools → Network → filtrar `/api/billing/invoices/send`.
3. **Verificar**: 1 POST `POST /api/billing/invoices/send` con body `{ propertyId, contractId, period: 'YYYY-MM' }`.
4. **Verificar**: el server responde 200 con `{ fileId, webViewLink, invoiceNumber: 'CC-YYYYMM-NNN' }`.
5. **Verificar**: el PDF se descarga automáticamente al browser del agente.
6. **Verificar**: toast de éxito: `✓ Cuenta de cobro enviada: CC-YYYYMM-NNN`.
7. En phpMyAdmin: `SELECT id, invoice_number, sent_at, status FROM rent_invoices WHERE period = 'YYYY-MM' AND property_id = 'X';`
8. **Verificar**: aparece la fila con `invoice_number='CC-YYYYMM-NNN'` y `sent_at` NOT NULL.
9. En BillingPanel: la fila de amortización se marca con icono de "enviado" (timestamp visible).

**Status:** ⏳ Pending

---

#### AC-11: El consecutivo `invoice_number` es idempotente

**Pasos:**

1. Re-click "Enviar CC" en la misma fila (mismo período).
2. **Verificar**: el server devuelve el MISMO `invoice_number` (NO incrementa NNN).
3. En phpMyAdmin: `SELECT COUNT(*) FROM rent_invoices WHERE period = 'YYYY-MM' AND property_id = 'X';`
4. **Verificar**: sigue habiendo **1 sola fila** (no se duplica).

**Status:** ⏳ Pending

---

#### AC-12: El PDF de cuenta de cobro tiene formato colombiano

**Pasos:**

1. Abrir el PDF descargado en AC-10.
2. **Verificar** los siguientes campos en el PDF:
   - "DEBE A" = nombre completo del INQUILINO (no del propietario).
   - "OBJETO" = texto que incluye canon + admin + número de contrato.
   - Sección de "Datos de consignación" = `BillingPolicy.bankAccounts[primary]` (banco, tipo de cuenta, número, titular).
     - Si no hay cuenta configurada, línea punteada `____________________`.
   - "Valor en letras" = `numeroAPesosColombianosCaps` con formato "PESOS M/CTE".
   - Layout clásico de cuenta de cobro colombiana (logo, membrete, líneas punteadas para firmas).

**Status:** ⏳ Pending

---

#### AC-13: El PDF se descarga localmente Y se sube a Drive

**Pasos:**

1. Con Drive conectado (OAuth válido): click "Enviar CC".
2. **Verificar**: el PDF se descarga al browser (igual que siempre).
3. **Verificar**: el server sube el PDF a `Recibos/{nombre} ({cédula})/` del inquilino en Drive.
4. DevTools → Console: ver log de "PDF subido a Drive con fileId=X".
5. **Verificar**: el `webViewLink` devuelto en el response es un link válido a `drive.google.com`.
6. Click en el link → **Verificar**: el PDF se abre en Drive.

**Caso Drive caído:** 7. DevTools → Network → Block `*googleapis.com*`. 8. Click "Enviar CC". 9. **Verificar**: el PDF se descarga local igual. 10. **Verificar**: toast de warning (no error): "PDF descargado localmente. No se pudo subir a Drive.". 11. **Verificar**: la fila de amortización SÍ se marca como enviada (`sent_at` NOT NULL), aunque Drive haya fallado.

**Status:** ⏳ Pending

---

### Sección 4: Registrar Pago (PaymentModal)

#### AC-14: El botón "Marcar pagado" abre el PaymentModal

**Pasos:**

1. En BillingPanel, fila de amortización con `sentAt` (ya enviada) y `status != paid`.
2. Click "Marcar pagado".
3. **Verificar**: se abre el `PaymentModal` con campos:
   - "Día del mes de pago" (input numérico 1-30, default = día actual).
   - "Monto total" (input numérico, default = `total` de la fila).
4. Probar `día = 0` o `día = 31` → **Verificar**: error inline "Día debe estar entre 1 y 30".
5. Probar `monto = 0` o `monto = -1` → **Verificar**: error inline "Monto debe ser > 0".
6. **Verificar**: botón "Confirmar pago" disabled mientras haya errores.

**Status:** ⏳ Pending

---

#### AC-15: Al confirmar, se calcula la mora automáticamente

**Pasos:**

1. Con `graceDay = 10` (default), `lateFeeMidPct = 5`, `lateFeeLatePct = 10`.
2. Caso A: día de pago = 5 (< graceDay) → mora = 0%, total = `total_early`.
3. Caso B: día de pago = 15 (entre graceDay+1 y 20) → mora = 5%, total = `total_mid`.
4. Caso C: día de pago = 25 (> 20) → mora = 10%, total = `total_late`.
5. **Verificar**: en cada caso, el `total` mostrado en el modal es el correcto según el día.

**Status:** ⏳ Pending

---

#### AC-16: El pago se registra en la fila de amortización

**Pasos:**

1. Confirmar pago con día y monto válidos.
2. DevTools → Network → filtrar `/api/billing/payments`.
3. **Verificar**: 1 POST `POST /api/billing/payments` con body `{ contractId, rowId, paidOnDayOfMonth, paidAmount }`.
4. **Verificar**: el server responde 200 con `{ row: AmortizationRow }`.
5. En phpMyAdmin: `SELECT status, paid_at, paid_amount FROM amortization_rows WHERE id = 'X';`
6. **Verificar**: `status='paid'` (si `paidAmount >= total`), `paid_at` NOT NULL, `paid_amount = paidAmount`.
7. Caso pago parcial: registrar pago con `paidAmount < total`.
8. **Verificar**: `status='partial'`, `paid_amount = paidAmount` (no se clampa al total).

**Status:** ⏳ Pending

---

#### AC-17: Al pagar el mes N, se desbloquea el mes N+1

**Pasos:**

1. Tener amortización generada (mínimo 3 meses).
2. Verificar que el mes N+1 tiene un candado 🔒 y tooltip "Pagá el mes anterior para habilitar".
3. **Verificar**: el botón "Enviar CC" del mes N+1 está **disabled**.
4. Pagar el mes N (AC-16 con `status='paid'`).
5. **Verificar**: el candado 🔒 del mes N+1 desaparece.
6. **Verificar**: el botón "Enviar CC" del mes N+1 está **enabled**.

**Status:** ⏳ Pending

---

#### AC-18: Toast honesto de pago

**Pasos:**

1. Pago exitoso → **Verificar**: toast `✓ Pago registrado: $X el día Y del mes Z`.
2. Error de server (DevTools → Network → Block) → **Verificar**: toast `Error al registrar el pago: ${error}`.
3. **Verificar**: el modal NO se cierra en error.

**Status:** ⏳ Pending

---

### Sección 5: Estado de Cuenta del Propietario (EstadoCuentaView)

#### AC-19: El estado de cuenta se muestra en el BillingPanel

**Pasos:**

1. Abrir BillingPanel de una propiedad con contrato activo.
2. **Verificar**: hay una sección "Estado de Cuenta del Propietario" con:
   - Resumen ejecutivo (ingresos cobrados, gastos aplicados, retenciones, neto calculado).
   - Tabla de detalle de movimientos del período.
   - Tabla de transferencias reales (de `owner_payouts`).
3. **Verificar**: hay un selector de período (default = período actual YYYY-MM).

**Status:** ⏳ Pending

---

#### AC-20: El cálculo teórico viene de `calculateMonthlySettlement`

**Pasos:**

1. Con un contrato activo con `commissionPct`, canon y admin conocidos.
2. **Verificar**: el "NETO CALCULADO" mostrado en el resumen = canon + admin - comisión - retenciones - descuentos.
3. **Verificar**: los valores numéricos coinciden con un cálculo manual del agente.

**Status:** ⏳ Pending

---

#### AC-21: Las transferencias reales vienen de `owner_payouts`

**Pasos:**

1. Insertar 1 fila de prueba en `owner_payouts` (vía modal "Registrar transferencia" o phpMyAdmin).
2. Recargar el BillingPanel.
3. **Verificar**: aparece la fila en la tabla con columnas: fecha, monto, banco, referencia, notas.
4. Si NO hay payouts en el período → **Verificar**: aparece mensaje "Sin transferencias registradas este período".

**Status:** ⏳ Pending

---

#### AC-22: El botón "Descargar PDF" genera el estado de cuenta

**Pasos:**

1. En EstadoCuentaView, click "Descargar PDF".
2. DevTools → Network → filtrar `/api/billing/owner-statement`.
3. **Verificar**: 1 GET `GET /api/billing/owner-statement?propertyId=X&period=YYYY-MM`.
4. **Verificar**: el server responde 200 con `{ statement: { summary, movements, payouts }, pdfBase64?, webViewLink? }`.
5. **Verificar**: el PDF se descarga automáticamente.
6. Abrir el PDF:
   - **Verificar**: replica el modelo `modelo-estado-de-cuenta.pdf`.
   - Sección 5 (clasificación por antigüedad) está OMITIDA.
   - Sección 6 (instrucciones de pago) muestra datos del PROPIETARIO (no del cliente).
   - Sección 8 (firmas): Elaboró / Aprobó / Recibido por propietario.

**Status:** ⏳ Pending

---

#### AC-23: El PDF se sube automáticamente a Drive

**Pasos:**

1. Con Drive conectado: click "Descargar PDF" del estado de cuenta.
2. **Verificar**: el PDF se descarga local.
3. **Verificar**: el server lo sube a `Propietario/EstadosCuenta/` dentro de la carpeta de la propiedad en Drive.
4. **Verificar**: toast: `✓ Estado de cuenta descargado. Subido a Drive: Propietario/EstadosCuenta/.`
5. **Verificar**: el `webViewLink` del response abre el PDF en Drive.

**Caso Drive caído:** 6. DevTools → Network → Block `*googleapis.com*`. 7. Click "Descargar PDF". 8. **Verificar**: el PDF se descarga local igual. 9. **Verificar**: toast de warning: "PDF descargado localmente. No se pudo subir a Drive." 10. **Verificar**: la descarga local NO se rompe (el flujo sigue funcionando).

**Status:** ⏳ Pending

---

### Sección 6: Descuentos y Aumentos (NovedadFormModal + IncreaseFormModal)

#### AC-24: Descuentos al propietario

**Pasos:**

1. En BillingPanel o EstadoCuentaView, abrir `NovedadFormModal` con `chargedTo='owner'`.
2. Llenar: tipo, descripción, monto, mes del período.
3. Confirmar.
4. **Verificar**: POST a `/api/property-discounts` (o `/api/property-charges` si aplica) con status 200.
5. **Verificar**: toast: `✓ Descuento registrado: $X`.
6. **Verificar**: la fila aparece en la tabla de detalle del Estado de Cuenta del Propietario.

**Status:** ⏳ Pending

---

#### AC-25: Aumentos al inquilino (IPC anual)

**Pasos:**

1. Abrir `IncreaseFormModal` con `type='ipc_annual'`.
2. Llenar: descripción, monto, `effective_from='YYYY-MM'`.
3. Confirmar.
4. **Verificar**: POST a `/api/rent-increases` con status 200.
5. **Verificar**: toast: `✓ Aumento registrado: $X efectivo desde YYYY-MM`.
6. **Verificar**: la amortización del mes `effective_from` en adelante refleja el nuevo canon.

**Status:** ⏳ Pending

---

#### AC-26: Validación de campos

**Pasos:**

1. Probar `monto = 0` o `monto = -1` → **Verificar**: error inline "Monto debe ser > 0".
2. Probar `effective_from = '2026-13'` (mes inválido) → **Verificar**: error inline "Mes debe ser YYYY-MM válido".
3. Probar `descripcion = ''` (vacía) → **Verificar**: error inline "Descripción requerida".
4. **Verificar**: el botón "Confirmar" está disabled mientras haya errores.

**Status:** ⏳ Pending

---

### Sección 7: Timeouts y errores

#### AC-27: Top-level try/catch + JSON errors

```powershell
# Body con JSON malformado
$body = '{"propertyId":"X","rentAmount":"INVALID"'
$h = Invoke-WebRequest -Method POST -Uri "https://inmocontrol.tecnowebsupportia.com/api/billing/policies/X" `
  -Headers @{"Content-Type"="application/json"} -Body $body -UseBasicParsing -TimeoutSec 10
Write-Host "Status: $($h.StatusCode)"
Write-Host $h.Content
```

**Esperado:**

- Status `400 Bad Request` o `500 Internal Server Error` (según endpoint).
- Body 100% JSON: `{ "error": "..." }`.
- **NUNCA** HTML (Express default error page).

**Status:** ⏳ Pending

---

#### AC-28: Drive operations timeout 8s server-side

**Pasos:**

1. En el server, forzar que `oauth2Client.refreshAccessToken()` tarde >8s (mock con sleep o desconectar red).
2. Click "Enviar CC" o "Descargar PDF estado de cuenta".
3. **Verificar**: el server responde en <10s (no se cuelga para siempre).
4. **Verificar**: response incluye error específico de Drive: `{ "error": "Drive timeout: ..." }`.
5. **Verificar**: status code 503 (Service Unavailable) o 504 (Gateway Timeout).

**Status:** ⏳ Pending

---

#### AC-29: Cliente timeout 15s via AbortController

**Pasos:**

1. DevTools → Network → Throttling → Slow 3G.
2. Click "Enviar CC" o "Marcar pagado" o "Descargar PDF".
3. **Esperar** >15s.
4. **Verificar**: aparece toast de error: `El servidor tardó demasiado. Reintentá en unos segundos.`
5. **Verificar**: el modal vuelve a su estado normal (no queda "Generando..." infinito).
6. **Verificar**: el botón se rehabilita para reintento.

**Status:** ⏳ Pending

---

#### AC-30: El botón "Generar" se deshabilita durante la subida

**Pasos:**

1. DevTools → Throttling → Slow 3G.
2. Click "Enviar CC" o "Descargar PDF".
3. **Verificar**: el botón muestra spinner + texto "Generando...".
4. **Verificar**: el botón está `disabled` (no se puede hacer doble click).
5. **Verificar**: cuando termina (éxito o error), el botón vuelve a su estado normal.

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: El server está caído al generar la amortización

**Pasos:**

1. Generar policy OK (primer POST responde 200).
2. Inmediatamente después, el server se cae (desconectar wifi o matar proceso).
3. El segundo POST (amortización) falla con timeout.
4. **Verificar**: toast de error claro.
5. **Verificar**: la policy SÍ quedó guardada en MySQL.
6. Restaurar conexión. En BillingPanel, click "Regenerar amortización" (botón manual).
7. **Verificar**: la amortización se genera sin pedir policy de nuevo.

**Status:** ⏳ Pending

---

### EC-2: La policy tiene campos inválidos (ej: graceDay=0)

**Pasos:**

1. Cliente: el wizard rechaza `graceDay=0` con error inline (AC-4).
2. Servidor: defensa en profundidad.
3. Probar bypass: `curl -X POST /api/billing/policies/:id -d '{"graceDay":0,...}'`.
4. **Verificar**: el server rechaza con `400 Bad Request` y `{ "error": "graceDay debe estar entre 1 y 28" }`.

**Status:** ⏳ Pending

---

### EC-3: El agente hace click 2 veces rápido en "Enviar CC"

**Pasos:**

1. Click rápido 2 veces en "Enviar CC" (dentro de 1 segundo).
2. **Verificar**: solo se dispara 1 POST al server (el segundo click es ignorado por el `disabled`).
3. En phpMyAdmin: `SELECT COUNT(*) FROM rent_invoices WHERE period = 'YYYY-MM' AND property_id = 'X';`
4. **Verificar**: sigue habiendo **1 sola fila** con el mismo `invoice_number`.

**Status:** ⏳ Pending

---

### EC-4: El día de pago es 31 (no existe en todos los meses)

**Pasos:**

1. En PaymentModal, intentar ingresar `día = 31`.
2. **Verificar**: el cliente rechaza con error "Día debe estar entre 1 y 30".
3. Bypass cliente: `curl -X POST /api/billing/payments -d '{"paidOnDayOfMonth":31,...}'`.
4. **Verificar**: el server lo acepta pero calcula como si fuera 30 (clamping defensivo).
5. **Verificar**: el `total` registrado corresponde al tramo de mora del día 30 (no tira error 500).

**Status:** ⏳ Pending

---

### EC-5: El pago es parcial (monto < total)

**Pasos:**

1. Confirmar pago con `paidAmount = total / 2` (mitad).
2. **Verificar**: `status='partial'` y `paid_amount = total / 2`.
3. **Verificar**: la fila muestra "Pago parcial: $X de $Y".
4. Intentar otro pago parcial: `paidAmount = total / 4`.
5. **Verificar**: `paid_amount` se actualiza al NUEVO valor (no se suma — se sobreescribe).
6. **Verificar**: el "restante" se calcula como `total - paid_amount`.

**Status:** ⏳ Pending

---

### EC-6: El agente paga el mes N+1 sin pagar el N

**Pasos:**

1. UX: el botón "Enviar CC" del mes N+1 está bloqueado por candado 🔒 (AC-17).
2. Bypass: el server lo permite si el agente manipula el POST directamente.
3. `curl -X POST /api/billing/payments -d '{"rowId":"N+1",...}'` (con `paidAmount=total`).
4. **Verificar**: el server responde 200 (no bloquea por UX, solo por API).
5. **Verificar**: el mes N sigue mostrando "Pendiente" en el BillingPanel.

**Status:** ⏳ Pending

---

### EC-9: El agente quiere ver el estado de cuenta de un período pasado

**Pasos:**

1. En EstadoCuentaView, click en el selector de período.
2. Elegir un período pasado (ej: 3 meses atrás).
3. **Verificar**: el resumen ejecutivo y las tablas muestran los datos de ese período.
4. Si NO hay movimientos en ese período → **Verificar**: mensaje "Sin movimientos este período".

**Status:** ⏳ Pending

---

### EC-10: El PDF de cuenta de cobro NO se genera (Drive falla, etc.)

**Pasos:**

1. DevTools → Network → Block response del endpoint `/api/billing/invoices/send`.
2. Click "Enviar CC".
3. **Verificar**: el server devuelve 500 con `{ "error": "..." }` específico.
4. **Verificar**: toast: `No se pudo generar la cuenta de cobro. Reintentá.`
5. **Verificar**: la fila de amortización NO se marca como enviada (rollback).

**Status:** ⏳ Pending

---

## Resumen de checks

| Tipo                 | Cantidad                                            |
| -------------------- | --------------------------------------------------- |
| Pre-checks           | 1 (PRE-1)                                           |
| Acceptance Criteria  | 30 (AC-1 a AC-30)                                   |
| Edge Cases cubiertos | 8 (EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-9, EC-10) |
| **Total checks**     | **39**                                              |

**ECs omitidos intencionalmente:**

- EC-7 (IPC del primer año) — interno del cálculo, no verificable sin manipular fechas del contrato.
- EC-8 (descuento > neto) — out of scope de UX, requiere manipulación de datos de prueba.
- EC-11 (comprobante de pago) — **out of scope** del spec (sección 9).

---

## Cómo correr este verifier contra prod

```powershell
# 1. Asegurarse de que el deploy está actualizado
#    (verificar último commit en hPanel → Despliegues)

# 2. Hard refresh del browser (Ctrl+Shift+R) en incógnito

# 3. Login en https://inmocontrol.tecnowebsupportia.com

# 4. Para cada AC:
#    - Leer los "Pasos"
#    - Ejecutar manualmente
#    - Marcar ✅ PASS, ❌ FAIL, o ⚠️ SKIP
#    - Si es FAIL, adjuntar el output real (screenshot, log de console, query de MySQL)

# 5. Al terminar, compartir el verifier completo con el output para revisión
```

## Aprobación

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03

> **Recordatorio Karpathy**: una vez aprobado este verifier, se corre contra
> prod en **Fase Roja** (esperamos que varios checks fallen). Cada FAIL
> se traduce a un fix de código, NO a una modificación del verifier.

> **Estado del ciclo Karpathy** (al 2026-08-03):
>
> - Spec: ✅ Aprobado (`docs/specs/wizard_billing.md`)
> - Verifier: ✅ Aprobado (este archivo)
> - Próximo paso: **Fase Roja** — correr los 39 checks contra prod
>   (`https://inmocontrol.tecnowebsupportia.com`) y registrar los FAILs.
> - Pendiente: `scripts/verifier-wizard-billing.ps1` (runner PowerShell, análogo
>   a `scripts/verifier-wizard-property.ps1`) — crear cuando arranquemos Fase Roja.
