# Fix: Regenerar amortización revierte paid → pending (BUG-004)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-004-regenerate-amortization.md`.
>
> **Bug origen**: BUG-004 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🔴 Alta (financiera, pérdida de trazabilidad).
> **Stack afectado**: `server/routes/billing.ts` (endpoint `POST /api/billing/amortization/generate`).

## 1. User Story

**As a** agente inmobiliario regenerando la amortización de un contrato (porque cambió la policy, IPC anual, o los parámetros del contrato),
**I want to** que las filas ya marcadas como `paid` o `partial` se preserven tal cual,
**So that** no se pierda la trazabilidad de pagos ya registrados, y la amortización regenerada solo actualice los valores monetarios de filas pendientes o de meses futuros.

## 2. Contexto del bug

### Estado actual (roto)

`server/routes/billing.ts:245-268` — el `ON DUPLICATE KEY UPDATE` incluye:

```sql
ON DUPLICATE KEY UPDATE
  period_start = VALUES(period_start),
  ...
  total_late   = VALUES(total_late),
  status       = VALUES(status)   -- ← BUG: pisa paid → pending
```

Y `generateAmortization(contract, policy, increases)` (en `utils/financial/calculateAmortization.ts` o similar) **siempre emite `status: 'pending'`** para todas las filas.

### Resultado

| Escenario                            | Comportamiento actual                                     | Comportamiento esperado                                                |
| ------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Regenerar sin pagos                  | OK (todo sigue pending)                                   | Igual                                                                  |
| Regenerar con 1 mes pagado           | **Mes pagado vuelve a pending**                           | Mes pagado sigue `paid`, valores monetarios se actualizan              |
| Regenerar con 1 mes pago parcial     | **Mes parcial vuelve a pending**                          | Mes parcial sigue `partial`, `paid_amount` se preserva                 |
| Regenerar agregando un aumento (IPC) | Meses futuros actualizan OK; meses pagados **se pierden** | Meses futuros actualizan; meses pagados preservan status y paid_amount |

### Por qué rompe financieramente

1. Agente registra pago del mes 6 ($1,500,000).
2. Servidor marca `status='paid'`, `paid_at=NOW()`, `paid_amount=1500000`.
3. Agente decide cambiar la policy (ej. subir mora mid de 5% a 7%) o agregar un aumento IPC.
4. Regenera amortización.
5. **El mes 6 vuelve a `status='pending'`, `paid_at=NULL`, `paid_amount=NULL`.**
6. La próxima consulta del agente muestra "Mes 6 pendiente", aunque el inquilino ya pagó.
7. Si el agente no se da cuenta y vuelve a marcar pago, **se cobra doble** (o se genera una disputa).

## 3. Acceptance Criteria

### AC-1: Filas con `status='paid'` o `status='partial'` NO se pisan

- El `ON DUPLICATE KEY UPDATE` **NO incluye** `status`, `paid_at`, `paid_amount`.
- Solo se actualizan los campos monetarios: `total`, `total_early`, `total_mid`, `total_late`, `subtotal`, `base_rent`, `base_admin`, `admin_adjustment`, `ipc_adjustment`, `late_fee_amount`, `applied_late_fee_pct`.
- **Excepción**: si la policy cambió de `lateFeeMidPct` 5% a 7%, la mora se recalcula, pero la fila pagada sigue con el `late_fee_amount` que tenía al momento del pago. Esto es aceptable porque el status no cambia.

### AC-2: Filas con `status='pending'` o `status='overdue'` se actualizan normalmente

- Se reemplazan los valores monetarios con los nuevos.
- El status sigue siendo `pending` (que es lo que devuelve `generateAmortization`).
- **No se rompe el flujo de regenerar amortización**: sigue funcionando como antes para filas pendientes.

### AC-3: Si la policy o el contrato cambió tanto que la cantidad de meses es distinta

- Si la nueva amortización tiene MENOS meses (ej. el contrato se acortó), las filas que exceden no se tocan (siguen en MySQL con sus valores viejos).
- Si la nueva amortización tiene MÁS meses, se INSERTAN las nuevas filas (no hay conflicto de PK).
- **Decisión a tomar**: ¿queremos DELETAR las filas que exceden? Por ahora, no (preservar histórico). Documentado en EC-3.

### AC-4: La respuesta del endpoint sigue siendo la misma

- Devuelve `res.json(rows)` con las filas generadas.
- No cambia la shape ni el status code.

### AC-5: Logging del cambio

- Cuando se regenera amortización con pagos existentes, loggear WARNING en el server:
  ```
  [amortization/generate] Regenerando con N pagos existentes preservados.
  ```
- Esto ayuda a debugging futuro y a audits.

## 4. Edge Cases

### EC-1: Regenerar sin pagos registrados

- **Esperado**: comportamiento normal, todas las filas siguen `pending`.

### EC-2: Regenerar con 1 pago parcial + cambio de policy que afecta el subtotal

- **Esperado**: la fila parcial mantiene `status='partial'`, `paid_amount=X` (NO se recalcula). El subtotal se actualiza al nuevo valor. La UI muestra "Restante: total - paid_amount" con el nuevo total.

### EC-3: Cambiar el rango de fechas del contrato (startDate o endDate)

- **Esperado**: filas fuera del nuevo rango se mantienen en MySQL (no se borran). Filas dentro del rango se actualizan.
- **Decisión a tomar**: ¿queremos DELETE de las que exceden? **Por ahora NO** — preservamos histórico. Si se necesita, se agrega en un fix futuro.

### EC-4: Cambiar el contractId (cambiar de contrato)

- **Esperado**: este caso no debería pasar porque la amortización se regenera siempre para el MISMO contractId. Si pasa (raro), el endpoint responde 200 con las nuevas filas, y las viejas quedan huérfanas.
- **No es bug de este fix**, es un caso de borde que requiere DELETE manual.

### EC-5: Aumentos (rent_increases) con `effective_from` en el pasado

- **Esperado**: si hay un aumento con `effective_from` antes de un mes ya pagado, ese mes sigue con sus valores viejos (no se recalcula con el nuevo canon).
- Esto es consistente con AC-1: filas pagadas no se tocan.

### EC-6: Backend no tiene el contrato en MySQL

- **Esperado**: `generateAmortization` falla con error claro. La respuesta es 500 con mensaje del error.
- (Esto no cambia con el fix, es solo documentación.)

## 5. Technical Contract

### Antes (`server/routes/billing.ts:245-268`)

```ts
for (const row of rows) {
  await pool.query(
    `INSERT INTO amortization_rows
       (id, organization_id, property_id, contract_id,
        month_number, period_start, period_end, due_date,
        base_rent, base_admin, admin_adjustment, ipc_adjustment,
        subtotal, applied_late_fee_pct, late_fee_amount,
        total, total_early, total_mid, total_late, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       period_start = VALUES(period_start),
       period_end   = VALUES(period_end),
       due_date     = VALUES(due_date),
       base_rent    = VALUES(base_rent),
       base_admin   = VALUES(base_admin),
       admin_adjustment = VALUES(admin_adjustment),
       ipc_adjustment   = VALUES(ipc_adjustment),
       subtotal     = VALUES(subtotal),
       total        = VALUES(total),
       total_early  = VALUES(total_early),
       total_mid    = VALUES(total_mid),
       total_late   = VALUES(total_late),
       status       = VALUES(status)`, // ← BUG
    [
      row.id,
      orgId,
      row.propertyId,
      row.contractId,
      row.monthNumber,
      row.periodStart,
      row.periodEnd,
      row.dueDate,
      row.baseRent,
      row.baseAdmin,
      row.adminAdjustment,
      row.ipcAdjustment,
      row.subtotal,
      row.appliedLateFeePct,
      row.lateFeeAmount,
      row.total,
      row.totalEarly,
      row.totalMid,
      row.totalLate,
      row.status,
    ],
  );
}
```

### Después

```ts
// Contar pagos existentes antes (para logging)
const [paidRowsBefore] = await pool.query(
  `SELECT COUNT(*) as paid_count FROM amortization_rows WHERE contract_id = ? AND status IN ('paid', 'partial')`,
  [contract.id],
);
const paidCount = (paidRowsBefore as any[])[0]?.paid_count ?? 0;
if (paidCount > 0) {
  console.warn(
    `[amortization/generate] Regenerando con ${paidCount} pagos existentes preservados.`,
  );
}

for (const row of rows) {
  await pool.query(
    `INSERT INTO amortization_rows
       (id, organization_id, property_id, contract_id,
        month_number, period_start, period_end, due_date,
        base_rent, base_admin, admin_adjustment, ipc_adjustment,
        subtotal, applied_late_fee_pct, late_fee_amount,
        total, total_early, total_mid, total_late, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       period_start = VALUES(period_start),
       period_end   = VALUES(period_end),
       due_date     = VALUES(due_date),
       base_rent    = VALUES(base_rent),
       base_admin   = VALUES(base_admin),
       admin_adjustment = VALUES(admin_adjustment),
       ipc_adjustment   = VALUES(ipc_adjustment),
       subtotal     = VALUES(subtotal),
       total        = VALUES(total),
       total_early  = VALUES(total_early),
       total_mid    = VALUES(total_mid),
       total_late   = VALUES(total_late)
       -- NO se incluye status, paid_at, paid_amount
       -- Filas pagadas/parciales preservan su estado`,
    [
      row.id,
      orgId,
      row.propertyId,
      row.contractId,
      row.monthNumber,
      row.periodStart,
      row.periodEnd,
      row.dueDate,
      row.baseRent,
      row.baseAdmin,
      row.adminAdjustment,
      row.ipcAdjustment,
      row.subtotal,
      row.appliedLateFeePct,
      row.lateFeeAmount,
      row.total,
      row.totalEarly,
      row.totalMid,
      row.totalLate,
      row.status,
    ],
  );
}
```

## 6. Tostadas exactas (copy approved — NO improvisar)

Este fix es server-side, no agrega toasts. Pero el frontend puede agregar un toast informativo al regenerar:

| Trigger                        | Tipo            | Copy exacto                                         |
| ------------------------------ | --------------- | --------------------------------------------------- |
| Regenerar con pagos existentes | info (opcional) | `Amortización regenerada. N pago(s) preservado(s).` |

> **Decisión a tomar**: ¿agregamos este toast al cliente? Por ahora **fuera de scope** del fix server, queda como nice-to-have.

## 7. Out of Scope

- **Cambiar `generateAmortization` para emitir `status` distinto** según el estado actual de la fila — eso es lógica de cliente, no del fix.
- **DELETE de filas que exceden el nuevo rango** — fuera de scope (preservamos histórico).
- **Notificar al agente** que tiene pagos preservados — fuera de scope del fix server.
- **Tests automatizados con Vitest** — fuera de scope. Se verifica con el verifier E2E manual.
- **Recalcular `late_fee_amount` con la nueva mora aunque la fila esté pagada** — el spec preserva el `late_fee_amount` viejo (no se recalcula). Decisión de diseño: el monto de mora que pagó el inquilino es histórico.

## 8. Dependencias

### Archivos a modificar (potencialmente)

- `server/routes/billing.ts` (solo el handler `POST /api/billing/amortization/generate`)

### Archivos a NO tocar

- `src/features/billing/calculations.ts` (ni similares con `generateAmortization`) — la función sigue emitiendo `status: 'pending'`, lo cual está bien para filas nuevas y para el UPSERT de filas pendientes.
- `db/mysql/migrations/*` — no requiere migration (no cambia schema).
- `src/features/billing/views/BillingPanel.tsx` — el cliente no necesita cambios para que el fix funcione. Pero puede agregar el toast informativo como nice-to-have.

## 9. Riesgos identificados

- **Cambio de comportamiento silencioso**: si hay agentes que dependían del bug (regenerar para "limpiar" pagos), ahora no se limpian. **Bajo riesgo** porque el flujo legítimo nunca fue ese.
- **Logging de WARNING en server**: incrementa el volumen de logs en Hostinger. Bajo impacto.
- **Inconsistencia temporal**: durante la regeneración, las filas pagadas tienen valores monetarios viejos (mora vieja) pero el resto de la amortización tiene valores nuevos. Si el user ve el PDF de un mes pagado, ve la mora histórica. Esto es correcto y esperado.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03
