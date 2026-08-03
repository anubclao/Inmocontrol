# Fix: PaymentModal se cierra aunque el pago falle (BUG-003)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-003-payment-modal.md`.
>
> **Bug origen**: BUG-003 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🔴 Alta (financiera + UX).
> **Stack afectado**: `src/features/billing/components/PaymentModal.tsx` + `src/features/billing/views/BillingPanel.tsx`.

## 1. User Story

**As a** agente inmobiliario registrando un pago en InmoControl,
**I want to** que el modal "Registrar pago" se cierre SOLO si el POST al server respondió 200,
**So that** si el server falla (500, timeout, 409, red caída), el modal queda abierto con el día y monto pre-llenados para reintentar, sin perder la selección del usuario, y sin creer que el pago se registró cuando en realidad no.

## 2. Contexto del bug

### Estado actual (roto)

```ts
// BillingPanel.tsx:221-233
const handlePay = useCallback(async (paidOnDayOfMonth, _totalPaid) => {
  ...
  try {
    const updated = await registerPayment(...);
    if (!updated) { showToast('...', 'error'); return; }
    ...
    showToast(`Pago registrado: ...`, 'success');
  } catch (err: any) {
    showToast(`Error: ${err?.message ?? err}`, 'error');
    throw err;   // ← BUG: re-throw
  }
}, [...]);

// PaymentModal.tsx:65-73
const handleConfirm = async () => {
  setSubmitting(true);
  try {
    await onConfirm(day, totalAPagar);
    onClose();    // ← se ejecuta SIEMPRE, incluso si onConfirm rechaza
  } finally {
    setSubmitting(false);
  }
};
```

### Resultado

| Escenario                                         | Comportamiento actual                        | Comportamiento esperado                          |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| POST 200 OK                                       | Modal cierra, toast ✓ success                | Igual                                            |
| POST 500 server error                             | **Modal cierra**, toast error (100ms)        | **Modal queda abierto**, toast error persistente |
| Network timeout                                   | **Modal cierra**, toast error (100ms)        | **Modal queda abierto**, botón rehabilitado      |
| POST 409 conflict (rare)                          | **Modal cierra**, toast error                | **Modal queda abierto**, mensaje específico      |
| `registerPayment` returns null (fallo silencioso) | Toast error, return — **modal NO se cierra** | Igual (este caso ya está bien)                   |

### Por qué rompe financieramente

1. Agente selecciona día 15, total $X
2. Click "Confirmar"
3. Server falla (red, timeout, 500)
4. Toast de error 100ms
5. **Modal desaparece** ← agente pierde la selección
6. Agente cree que se registró (toast success mostrado por error hace 100ms? o simplemente confusión)
7. Amortización NO se actualizó (server falló)
8. Próxima corrida del agente: ve la fila como `pending` aunque "él ya marcó pagado"
9. Disputa con el inquilino

## 3. Acceptance Criteria

### AC-1: `PaymentModal.handleConfirm` decide cerrar según el resultado de `onConfirm`

- Si `await onConfirm(day, total)` resuelve (no rechaza) → cerrar modal.
- Si `await onConfirm(day, total)` rechaza (throw) → **NO cerrar** modal, dejar el día/monto pre-llenados.
- En ambos casos, rehabilitar el botón "Confirmar" (volver a `setSubmitting(false)`).

### AC-2: `BillingPanel.handlePay` no re-throws

- El `try/catch` interno maneja el error completamente (toast + log).
- NO hace `throw err;` al final.
- Devuelve un valor que el caller puede usar para saber si fue OK o no.

### AC-3: Firma de `onConfirm` prop cambia a `(day, total) => Promise<boolean>`

- Antes: `onConfirm: (day, total) => Promise<void>` (no informaba éxito/error)
- Después: `onConfirm: (day, total) => Promise<boolean>` donde `true` = OK (server respondió 200), `false` = error (server rechazó, timeout, etc.)
- **Breaking change en la API del componente**, pero solo hay 1 caller (BillingPanel).

### AC-4: El toast de éxito NO se muestra si `onConfirm` devuelve `false`

- El caller (BillingPanel) decide cuándo mostrar toast de éxito (basado en su propio chequeo de `updated !== null`).
- El toast de error SÍ se muestra siempre que `onConfirm` rechace o devuelva `false`.

### AC-5: El botón "Confirmar" se rehabilita tras error

- Después de un error (server 500, timeout, 409), `setSubmitting(false)` se ejecuta.
- El botón vuelve a estar clickeable.
- El día y monto siguen pre-llenados con la selección del usuario.

### AC-6: Timeouts del cliente respetados (15s)

- Si el POST tarda >15s (AbortController del cliente), `onConfirm` resuelve `false` con error de timeout.
- Toast: `El servidor tardó demasiado. Reintentá en unos segundos.`
- Modal sigue abierto.

### AC-7: Compatibilidad con el resto del flujo

- Si el pago es OK y se marca el mes como `paid`, el `useEffect` de `BillingPanel` que hace `refreshInvoiceLookup()` sigue funcionando (desbloquea mes N+1).
- El log de acción en `property_actions` sigue registrándose solo en éxito.

## 4. Edge Cases

### EC-1: User cierra el modal mientras el POST está en flight

- El `useEffect` cleanup del modal debe `AbortController.abort()` si el POST sigue corriendo.
- Si el POST ya respondió OK antes del abort, no importa (la fila ya está actualizada).
- Si el POST abortó, la fila queda en `pending` (consistente con la realidad del server).

### EC-2: Doble click rápido en "Confirmar" durante un POST en flight

- El botón está `disabled` durante `submitting=true`. Doble click no dispara 2 POSTs.
- Esto ya está bien, no requiere cambio.

### EC-3: `registerPayment` devuelve `null` (fallo silencioso del server)

- `handlePay` muestra toast "No se pudo registrar el pago" y retorna `false` (después del cambio).
- Modal queda abierto.

### EC-4: Server responde 200 pero con `status: 'partial'` (pago parcial)

- El `updated` que devuelve `registerPayment` tiene `status='partial'`.
- `handlePay` considera esto como ÉXITO (el server respondió 200) → toast de success, modal cierra.
- La fila muestra "Pago parcial" en la UI, no "Pagado" (es decisión de UI, no de este fix).

### EC-5: Server responde 200 pero la amortización NO se actualiza (data race raro)

- Si el `updated` que devuelve el server no matchea ninguna fila local (caso extremo), `setRows` no actualiza nada.
- `handlePay` muestra toast de éxito porque `updated !== null`.
- Modal cierra.
- **Decisión a tomar**: ¿queremos ser más estrictos y verificar que la fila local efectivamente cambió? (fuera de scope de este fix, anotado para futuro).

## 5. Technical Contract

### Antes (BillingPanel.tsx)

```ts
const handlePay = useCallback(async (paidOnDayOfMonth: number, _totalPaid: number) => {
  if (!payingRow || !selectedContract) return;  // <-- implicit return undefined
  try {
    const updated = await registerPayment(...);
    if (!updated) { showToast('No se pudo registrar el pago', 'error'); return; }
    setRows(...);
    await logAction(...);
    showToast(`Pago registrado: ...`, 'success');
    void refreshInvoiceLookup();
  } catch (err: any) {
    showToast(`Error: ${err?.message ?? err}`, 'error');
    throw err;  // <-- BUG
  }
}, [...]);
```

### Después

```ts
const handlePay = useCallback(
  async (paidOnDayOfMonth: number, _totalPaid: number): Promise<boolean> => {
    if (!payingRow || !selectedContract) return false;
    try {
      const updated = await registerPayment(
        selectedContract.id,
        payingRow.id,
        paidOnDayOfMonth,
      );
      if (!updated) {
        showToast("No se pudo registrar el pago", "error");
        return false; // <-- FIX
      }
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      await logAction(
        property.id,
        "payment_received",
        `Pago de ${formatCurrency(updated.paidAmount ?? updated.total)} recibido (día ${paidOnDayOfMonth})`,
        userName,
      );
      showToast(
        `Pago registrado: ${formatCurrency(updated.paidAmount ?? updated.total)}`,
        "success",
      );
      void refreshInvoiceLookup();
      return true; // <-- FIX
    } catch (err: any) {
      showToast(`Error: ${err?.message ?? err}`, "error");
      return false; // <-- FIX (no throw)
    }
  },
  [
    payingRow,
    selectedContract,
    property.id,
    userName,
    showToast,
    refreshInvoiceLookup,
  ],
);
```

### Antes (PaymentModal.tsx)

```ts
export interface PaymentModalProps {
  row: AmortizationRow | null;
  policy: BillingPolicy;
  onClose: () => void;
  onConfirm: (paidOnDayOfMonth: number, totalPaid: number) => Promise<void>; // <-- void
}

const handleConfirm = async () => {
  setSubmitting(true);
  try {
    await onConfirm(day, totalAPagar);
    onClose(); // <-- siempre
  } finally {
    setSubmitting(false);
  }
};
```

### Después

```ts
export interface PaymentModalProps {
  row: AmortizationRow | null;
  policy: BillingPolicy;
  onClose: () => void;
  onConfirm: (paidOnDayOfMonth: number, totalPaid: number) => Promise<boolean>; // <-- boolean
}

const handleConfirm = async () => {
  setSubmitting(true);
  try {
    const ok = await onConfirm(day, totalAPagar);
    if (ok) {
      onClose(); // <-- solo si OK
    }
    // si !ok, modal queda abierto, día y monto pre-llenados
  } finally {
    setSubmitting(false); // <-- siempre rehabilita el botón
  }
};
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                                  | Tipo    | Copy exacto                                                                   |
| ---------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Pago OK                                  | success | `✓ Pago registrado: $X` (X = monto del `updated.paidAmount ?? updated.total`) |
| Server 500 / network error               | error   | `Error: ${err.message}` (mensaje del server)                                  |
| registerPayment devolvió `null`          | error   | `No se pudo registrar el pago`                                                |
| Timeout 15s cliente                      | error   | `El servidor tardó demasiado. Reintentá en unos segundos.`                    |
| 409 conflict (rare, mismo mes pagado 2x) | error   | `Este mes ya está marcado como pagado.` (decidir copy exacto)                 |

## 7. Out of Scope

- **Refactor del `registerPayment`** (función en `billing/api.ts`) — no se toca en este fix.
- **Mejorar manejo de pagos parciales** (AC-16 del spec de billing) — eso es otro spec.
- **Reintentos automáticos** (backoff exponencial) — fuera de scope, el usuario decide cuándo reintentar.
- **Cambiar la forma de `onConfirm`** a un objeto `{ ok, error? }` — demasiado invasivo para 1 caller. Usar `Promise<boolean>` es suficiente.
- **Tests automatizados con Vitest** — fuera de scope del proyecto. Se verifica con el verifier E2E manual.

## 8. Dependencias

### Archivos a modificar (potencialmente)

- `src/features/billing/views/BillingPanel.tsx` (handlePay signature + no-throw)
- `src/features/billing/components/PaymentModal.tsx` (PaymentModalProps + handleConfirm)

### Archivos a NO tocar

- `src/features/billing/api.ts` (registerPayment — funciona bien, solo cambiamos cómo se consume)
- `src/features/billing/types.ts` (no cambia)
- `server/routes/billing.ts` (no cambia — el server ya devuelve 200/500/409 correctamente)

## 9. Riesgos identificados

- **Breaking change en PaymentModalProps.onConfirm**: si en el futuro alguien agrega otro caller del PaymentModal, debe adaptar la firma. Bajo riesgo (1 solo caller hoy).
- **Cierre accidental del modal si hay race condition**: si el POST termina justo cuando el user hace click en "Cancelar" (modal.onClose externo), podría haber un flash visual. Mitigable con un guard `if (cancelled) return;` en `handleConfirm` (out of scope para este fix).
- **Toast de error que el user ignora**: el modal queda abierto, pero si el user no lee el toast y hace click fuera, el modal cierra por el backdrop click. Esto es comportamiento esperado (modal se cierra, no es bloqueante). Out of scope.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03
