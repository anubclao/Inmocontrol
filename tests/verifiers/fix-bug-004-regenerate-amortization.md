# Verifier: Fix BUG-004 — Regenerar amortización preserva pagos

> **Karpathy Verifier** — Agosto 2026. Cada AC de
> `docs/specs/fix-bug-004-regenerate-amortization.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un check
> falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io` (DB `u652436213_inmocontrol`)
- PowerShell 7+ (o PS5) en Windows
- Para los tests: un contrato activo con amortización generada y al menos 1 mes marcado como `paid` o `partial`.

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

### AC-1: Filas con `status='paid'` o `status='partial'` NO se pisan

**Pasos:**

1. Seleccionar un contrato activo con al menos 1 mes pagado.
2. En phpMyAdmin, ejecutar:
   ```sql
   SELECT id, period_start, status, paid_at, paid_amount, total
   FROM amortization_rows
   WHERE contract_id = 'X' AND status = 'paid'
   LIMIT 1;
   ```
3. Anotar el `paid_at`, `paid_amount`, `total` actuales.
4. En el cliente, regenerar la amortización (BillingPanel → botón "Regenerar amortización" o vía wizard).
5. Esperar 2-3 segundos.
6. Volver a ejecutar la query del paso 2.
7. **Verificar**: `status` sigue siendo `'paid'`.
8. **Verificar**: `paid_at` es el mismo timestamp (NO cambió).
9. **Verificar**: `paid_amount` es el mismo monto.
10. **Verificar**: `total` puede haber cambiado si la policy cambió, pero el resto (mora, base_rent) se actualizó.

**Status:** ⏳ Pending

---

### AC-2: Filas con `status='pending'` se actualizan normalmente

**Pasos:**

1. En phpMyAdmin, seleccionar un contrato activo y modificar la policy (subir `lateFeeMidPct` de 5% a 7%):
   ```sql
   UPDATE billing_policies
   SET late_fee_mid_pct = 7
   WHERE property_id = 'X';
   ```
2. En el cliente, regenerar la amortización.
3. En phpMyAdmin:
   ```sql
   SELECT id, period_start, status, total, total_mid
   FROM amortization_rows
   WHERE contract_id = 'X' AND status = 'pending'
   LIMIT 1;
   ```
4. **Verificar**: `status` sigue siendo `'pending'`.
5. **Verificar**: `total_mid` refleja la nueva mora (7% en vez de 5%).

**Status:** ⏳ Pending

---

### AC-3: Si la cantidad de meses cambia, las filas que exceden se mantienen

**Pasos:**

1. En phpMyAdmin, contar filas de un contrato:
   ```sql
   SELECT COUNT(*) FROM amortization_rows WHERE contract_id = 'X';
   ```
2. Acortar el contrato (cambiar `endDate` para que tenga 2 meses menos).
3. Regenerar amortización.
4. Volver a contar:
   ```sql
   SELECT COUNT(*) FROM amortization_rows WHERE contract_id = 'X';
   ```
5. **Verificar**: el count NO cambió (filas viejas siguen ahí).
6. **Verificar**: las filas que exceden el nuevo `endDate` siguen con sus valores viejos (no se borraron, no se actualizaron).

**Status:** ⏳ Pending

---

### AC-4: La respuesta del endpoint sigue siendo la misma

**Pasos:**

1. Hacer un POST manual a `/api/billing/amortization/generate` con un body válido.
2. **Verificar**: el response es 200 con un array de `AmortizationRow` (mismo shape que antes).
3. **Verificar**: el status code es 200, no 500 ni 400.

**Status:** ⏳ Pending

---

### AC-5: Logging del cambio

**Pasos:**

1. Con un contrato que tenga 1 mes pagado, regenerar amortización.
2. En el server logs (Hostinger → "Registros de tiempo de ejecución" en hPanel), buscar el log:
   ```
   [amortization/generate] Regenerando con 1 pagos existentes preservados.
   ```
3. **Verificar**: el log aparece con el conteo correcto de pagos preservados.

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Regenerar sin pagos registrados

**Pasos:**

1. En phpMyAdmin, crear un contrato nuevo (o usar uno sin pagos).
2. Regenerar amortización.
3. **Verificar**: todas las filas se crean con `status='pending'`.
4. **Verificar**: NO aparece el warning log (porque no hay pagos para preservar).

**Status:** ⏳ Pending

---

### EC-2: Regenerar con 1 pago parcial + cambio de subtotal

**Pasos:**

1. Marcar 1 mes como `partial` con `paidAmount = 500000` y `total = 1500000`.
2. Cambiar la policy (subir canon → `total` sube a 1700000).
3. Regenerar.
4. **Verificar**: la fila sigue `partial` y `paid_amount = 500000` (NO se recalcula).
5. **Verificar**: el `total` de esa fila se actualizó a 1700000.
6. En la UI: "Restante: 1700000 - 500000 = 1200000".

**Status:** ⏳ Pending

---

### EC-3: Cambiar el rango de fechas del contrato

**Pasos:**

1. Anotar el `endDate` actual del contrato en phpMyAdmin.
2. Acortarlo (restar 60 días).
3. Regenerar.
4. **Verificar**: las filas con `period_start > new endDate` siguen en MySQL (no se borraron).
5. **Verificar**: las filas con `period_start <= new endDate` se actualizaron con los nuevos valores (si los hay).

**Status:** ⏳ Pending

---

### EC-4: Aumentos (rent_increases) con `effective_from` en el pasado

**Pasos:**

1. En phpMyAdmin, insertar un aumento:
   ```sql
   INSERT INTO rent_increases (id, contract_id, type, description, amount, effective_from, recorded_at, recorded_by)
   VALUES ('uuid-x', 'contract-id', 'ipc_annual', 'IPC 2026', 50000, '2026-06-01', NOW(), 'agent');
   ```
2. Regenerar.
3. **Verificar**: las filas con `period_start >= '2026-06-01'` reflejan el nuevo canon (con el aumento).
4. **Verificar**: las filas con `period_start < '2026-06-01'` Y `status='paid'` NO cambiaron (preservadas).
5. **Verificar**: las filas con `period_start < '2026-06-01'` Y `status='pending'` SÍ reflejan los nuevos valores (no les afecta el aumento, pero se actualizaron con la nueva mora de la policy).

**Status:** ⏳ Pending

---

### EC-5: Regenerar varias veces seguidas

**Pasos:**

1. Regenerar 3 veces seguidas (mismo contrato, misma policy).
2. **Verificar**: no hay error de duplicado ni nada raro.
3. **Verificar**: el conteo de filas se mantiene estable.
4. **Verificar**: los pagos existentes siguen preservados.

**Status:** ⏳ Pending

---

## Resumen

| Tipo                | Cantidad        |
| ------------------- | --------------- |
| Pre-checks          | 1 (PRE-1)       |
| Acceptance Criteria | 5 (AC-1 a AC-5) |
| Edge Cases          | 5 (EC-1 a EC-5) |
| **Total checks**    | **11**          |

---

## Aprobación

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]
