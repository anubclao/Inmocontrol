# Verifier: Fix BUG-003 — PaymentModal no se cierra en error

> **Karpathy Verifier** — Agosto 2026. Cada AC de
> `docs/specs/fix-bug-003-payment-modal.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un check
> falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io` (DB `u652436213_inmocontrol`)
- Browser con DevTools (F12 → Console + Network) en incógnito
- PowerShell 7+ (o PS5) en Windows
- Para los tests: una propiedad con `status='Arrendado'`, un tenant activo,
  y un contrato `active` con amortización generada (al menos 3 meses).

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere (adjuntar output real)
- ⚠️ **SKIP** — no verificable ahora (motivo)

---

## Pre-check

### PRE-1: Health check

```powershell
$h = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/health" -UseBasicParsing -TimeoutSec 10
Write-Host "Status: $($h.StatusCode)"
```

**Esperado:** `200 OK`

**Status:** ⏳ Pending

---

## Acceptance Criteria

### AC-1: `PaymentModal.handleConfirm` decide cerrar según el resultado de `onConfirm`

**Pasos:**

1. Hard refresh (Ctrl+Shift+R).
2. Login. Ir a una propiedad con amortización generada. Abrir BillingPanel.
3. Click en "Marcar pagado" de una fila con `status='pending'`.
4. **Verificar**: se abre el `PaymentModal` con día default y monto pre-rellenado.
5. DevTools → Network → filtrar `/api/billing/payments`.
6. **Caso A (POST 200 OK)**:
   - Click "Confirmar" en el modal.
   - **Verificar**: el POST devuelve 200.
   - **Verificar**: el modal se cierra.
   - **Verificar**: la fila ahora muestra "✓ Pagado".
7. **Caso B (POST 500)**: repetir pasos 3-5. DevTools → Network → Block response del endpoint.
   - Click "Confirmar".
   - **Verificar**: el server (o el block) devuelve 500.
   - **Verificar**: **el modal NO se cierra**.
   - **Verificar**: el botón "Confirmar" se rehabilita (no queda en spinner infinito).
   - **Verificar**: el día y monto siguen visibles en el modal (pre-llenados).
   - **Verificar**: toast de error visible con copy `Error: ${err.message}`.
8. **Caso C (Network error)**: DevTools → Network → Offline.
   - Click "Confirmar".
   - **Verificar**: el modal NO se cierra.
   - **Verificar**: toast de error: `Error: Failed to fetch` (o similar).
   - **Verificar**: botón rehabilitado.

**Status:** ⏳ Pending

---

### AC-2: `BillingPanel.handlePay` no re-throws

**Pasos:**

1. DevTools → Console → abrir.
2. Provocar un error en el POST (DevTools → Network → Block).
3. Click "Confirmar" en el PaymentModal.
4. **Verificar**: en la consola **NO aparece** un `Uncaught (in promise) Error...`.
5. **Verificar**: el handler del catch maneja el error completamente (toast + return).
6. DevTools → Sources → buscar `BillingPanel.tsx:handlePay`.
7. **Verificar**: la función retorna `boolean`, no `void`.
8. **Verificar**: NO hay `throw err;` en el catch.

**Status:** ⏳ Pending

---

### AC-3: Firma de `onConfirm` cambia a `Promise<boolean>`

**Pasos:**

1. DevTools → Sources → buscar `PaymentModal.tsx`.
2. **Verificar**: la signature de `PaymentModalProps.onConfirm` es:
   ```ts
   onConfirm: (paidOnDayOfMonth: number, totalPaid: number) => Promise<boolean>;
   ```
3. **Verificar**: NO es `Promise<void>`.
4. DevTools → Sources → buscar `BillingPanel.tsx:handlePay`.
5. **Verificar**: la signature de `handlePay` también devuelve `Promise<boolean>`.
6. **Verificar**: el `useCallback` declara `: boolean` en el return type.

**Status:** ⏳ Pending

---

### AC-4: El toast de éxito NO se muestra si `onConfirm` devuelve `false`

**Pasos:**

1. Provocar un error en el POST (DevTools → Network → Block).
2. Click "Confirmar".
3. **Verificar**: aparece SOLO el toast de error (NO el de éxito).
4. **Verificar**: el copy del toast de error coincide con la tabla de toasts del spec.

**Status:** ⏳ Pending

---

### AC-5: El botón "Confirmar" se rehabilita tras error

**Pasos:**

1. Provocar un error (DevTools → Block).
2. Click "Confirmar".
3. **Verificar**: el botón muestra "Confirmando..." durante el POST.
4. **Verificar**: tras el error, el botón vuelve a su label normal "Confirmar".
5. **Verificar**: el botón está `enabled` (no `disabled`).
6. **Verificar**: hacer click de nuevo dispara otro POST (no quedó "stuck").

**Status:** ⏳ Pending

---

### AC-6: Timeouts del cliente respetados (15s)

**Pasos:**

1. DevTools → Network → Throttling → Slow 3G.
2. Click "Confirmar" en el modal.
3. **Esperar** >15s.
4. **Verificar**: aparece toast: `El servidor tardó demasiado. Reintentá en unos segundos.`
5. **Verificar**: el modal NO se cierra.
6. **Verificar**: el botón "Confirmar" se rehabilita.

**Status:** ⏳ Pending

---

### AC-7: Compatibilidad con el resto del flujo

**Pasos (caso OK)**:

1. Click "Confirmar" con la red OK.
2. **Verificar**: el POST responde 200.
3. **Verificar**: la fila de amortización cambia a `status='paid'` en la UI.
4. **Verificar**: en DevTools → Network, ver el log de acción a `/api/property-actions` (o similar) con `action='payment_received'`.
5. **Verificar**: el mes N+1 se desbloquea (botón "Enviar CC" ahora enabled).

**Pasos (caso error)**:

1. Provocar error (DevTools → Block).
2. Click "Confirmar".
3. **Verificar**: NO se hace log de acción (porque no fue éxito).
4. **Verificar**: la fila NO cambia a `paid`.
5. **Verificar**: el mes N+1 sigue bloqueado (no se desbloquea por error).

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: User cierra el modal mientras el POST está en flight

**Pasos:**

1. DevTools → Throttling → Slow 3G.
2. Click "Confirmar" en el modal.
3. **Inmediatamente** (antes de que termine) hacer click en la X del modal o en el backdrop.
4. **Verificar**: el modal se cierra.
5. **Verificar**: el POST se aborta (DevTools muestra status `(canceled)`).
6. **Verificar**: la fila de amortización NO se actualizó (consistente con el server).

**Status:** ⏳ Pending

---

### EC-2: Doble click rápido en "Confirmar"

**Pasos:**

1. DevTools → Network → Slow 3G.
2. Hacer doble click rápido en "Confirmar".
3. **Verificar**: solo se dispara 1 POST (el segundo click es ignorado por `disabled`).
4. **Verificar**: en DevTools → Network, solo hay 1 request a `/api/billing/payments`.

**Status:** ⏳ Pending

---

### EC-3: `registerPayment` devuelve `null` (fallo silencioso)

**Pasos:**

1. Manipular el server para que `registerPayment` devuelva `null` (difícil de simular, skip si no se puede).
2. Alternativa: en `registerPayment` de `api.ts`, agregar temporalmente `return null;` después del fetch.
3. Click "Confirmar".
4. **Verificar**: toast: `No se pudo registrar el pago`.
5. **Verificar**: modal NO se cierra.
6. **Verificar**: botón rehabilitado.

**Status:** ⏳ Pending

---

### EC-4: Pago parcial (server responde 200 con `status='partial'`)

**Pasos:**

1. Configurar `paidAmount < total` en el modal (monto editable si está implementado, o via API directa).
2. Click "Confirmar".
3. **Verificar**: server responde 200 con `status='partial'`.
4. **Verificar**: modal cierra (porque fue OK, `onConfirm` devuelve `true`).
5. **Verificar**: la fila muestra "Pago parcial" en la UI (no "Pagado").

**Status:** ⏳ Pending

---

### EC-5: Pago de un mes ya pagado (409 conflict)

**Pasos:**

1. Marcar un mes como `paid`.
2. Sin hacer refresh, intentar marcar el mismo mes otra vez (con el modal re-abierto).
3. **Verificar**: el server devuelve 409 con mensaje específico.
4. **Verificar**: el modal NO se cierra.
5. **Verificar**: toast: `Este mes ya está marcado como pagado.` (o el copy que se decida).

**Status:** ⏳ Pending

---

## Resumen

| Tipo                | Cantidad        |
| ------------------- | --------------- |
| Pre-checks          | 1 (PRE-1)       |
| Acceptance Criteria | 7 (AC-1 a AC-7) |
| Edge Cases          | 5 (EC-1 a EC-5) |
| **Total checks**    | **13**          |

---

## Aprobación

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]

> **Recordatorio Karpathy**: una vez aprobado este verifier, se corre contra
> prod en **Fase Roja** (esperamos que AC-1 a AC-6 fallen si el fix no está
> aplicado). Cada FAIL se traduce a un fix de código, NO a una modificación
> del verifier.
