# Verifier: Wizard de Contrato (Edición + Auto-fill)

> **Karpathy Verifier** — Julio 2026. Cada Acceptance Criterion de
> `docs/specs/wizard_contract.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un
> check falla, el código está mal.

> **⚠️ Importante**: el botón "+ Nuevo Contrato" del módulo Contratos
> está OCULTO a propósito. Los contratos se crean automáticamente al
> firmar el Inventario de Colocación. Este verifier cubre el flujo
> de **edición** desde el módulo Contratos.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io` (DB `u652436213_inmocontrol`)
- Browser con DevTools (F12 → Console) en incógnito

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere
- ⚠️ **SKIP** — no verificable ahora

---

## Pre-check

### PRE-1: Health check

```powershell
$h = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/health" -UseBasicParsing -TimeoutSec 10
Write-Host "Status: $($h.StatusCode)"
```

**Status:** ⏳ Pending

---

## Acceptance Criteria

### AC-1: Modal "Editar Contrato" se abre desde la fila

**Pasos:**
1. Hard refresh (Ctrl+Shift+R).
2. Ir a Contratos.
3. Click en el ícono de "Editar" (lápiz) de cualquier fila.
4. **Verificar**: el modal "Editar Contrato" se abre con los valores del contract.

**Resultado esperado:**
- Modal abierto.
- propertyId, tenantId, rentAmount, adminFee, commissionPct, insurancePct, startDate, endDate, renewalStrategy, status, inventoryEndRequired, notes pre-llenados.

**Status:** ⏳ Pending

---

### AC-2: Al elegir propiedad, se autocompletan canon y adminFee

**Pasos:**
1. Abrir el modal de edición de un contract existente.
2. Cambiar el select de "Propiedad" a una propiedad que tenga un tenant activo con canon Y adminFee no cero.
3. **Verificar**: el campo "Inquilino" se autoselecciona.
4. **Verificar**: el campo "Canon mensual" se pre-rellena con el `rent` del tenant.
5. **Verificar**: el campo "Administración PH" se pre-rellena con el `adminFee` del tenant.

**Status:** ⏳ Pending

---

### AC-3: NO pisar valores que el user ya tocó

**Pasos:**
1. Abrir el modal de edición.
2. Cambiar manualmente el "Canon mensual" a 2000000.
3. Cambiar la propiedad a otra con un tenant diferente.
4. **Verificar**: el campo "Canon mensual" SIGUE siendo 2000000 (NO se sobrescribe con el del nuevo tenant).
5. Misma lógica para "Administración PH".

**Resultado esperado:**
- Si el form actual tiene `rentAmount > 0` o `adminFee > 0` antes del cambio de propiedad, NO se sobrescriben.

**Status:** ⏳ Pending

---

### AC-4: Auto-fill al mount del modal

**Pasos:**
1. Abrir el modal de CREAR (no editar) desde otro lugar, si existe.
2. **Verificar**: si la propiedad default tiene tenant activo, los campos vienen pre-llenados desde el mount.

**Status:** ⏳ Pending

---

### AC-5: Cuando se edita, NO se dispara el auto-fill

**Pasos:**
1. Abrir el modal de edición de un contract legacy con `rentAmount = 0`.
2. **Verificar**: el campo "Canon mensual" SIGUE en 0 (no se sobreescribe con el del tenant).
3. El form mantiene los valores del contract (no los del tenant).

**Status:** ⏳ Pending

---

### AC-6: Al cambiar el tenant, también se autocompletan

**Pasos:**
1. Abrir el modal de edición.
2. Cambiar el select de "Inquilino" a otro tenant.
3. **Verificar**: el "Canon mensual" se pre-rellena con el `rent` del nuevo tenant (si está en 0).
4. **Verificar**: el "Administración PH" se pre-rellena con el `adminFee` del nuevo tenant (si está en 0).

**Status:** ⏳ Pending

---

### AC-7: El PATCH al server preserva TODOS los campos

```powershell
# Test: hacer un PATCH con todos los campos y verificar que se persistieron
$body = @"
{
  "propertyId": "X",
  "tenantId": "Y",
  "rentAmount": 1800000,
  "adminFee": 250000,
  "commissionPct": 8,
  "insurancePct": 0,
  "startDate": "2026-07-01",
  "endDate": "2027-07-01",
  "renewalStrategy": "manual",
  "status": "active",
  "inventoryEndRequired": true,
  "notes": "TEST-AC7 update"
}
"@
$res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/contracts/CONTRACT_ID" `
  -Method PATCH -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
```

**Esperado**: 200 con JSON del contract actualizado.

```powershell
# Verificar en phpMyAdmin:
SELECT rent_amount, admin_fee, commission_pct, notes
FROM contracts
WHERE id = 'CONTRACT_ID';
# Esperado: rent_amount=1800000.00, admin_fee=250000.00, etc.
```

**Status:** ⏳ Pending

---

### AC-8: Top-level try/catch + JSON errors

```powershell
# Test: PATCH con body malformado
$body = '{"rentAmount": "esto no es numero"}'
$res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/contracts/CONTRACT_ID" `
  -Method PATCH -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
Write-Host $res.Content
```

**Esperado**: 400 JSON. NO HTML.

**Status:** ⏳ Pending

---

### AC-9: Validación inline de campos numéricos

**Pasos:**
1. Abrir modal de edición.
2. Cambiar "Canon mensual" a -100.
3. **Verificar**: error inline "El canon no puede ser negativo".
4. Cambiar "Comisión" a 50 (>30).
5. **Verificar**: error inline "Comisión debe estar entre 0 y 30%".
6. Cambiar "Seguro" a 30 (>20).
7. **Verificar**: error inline "Seguro debe estar entre 0 y 20%".

**Status:** ⏳ Pending

---

### AC-10: La fecha de fin debe ser >= fecha de inicio

**Pasos:**
1. Abrir modal de edición.
2. startDate = "2027-01-01", endDate = "2026-01-01".
3. **Verificar**: error inline "La fecha de fin debe ser posterior a la fecha de inicio".
4. NO se envía el PATCH.

**Status:** ⏳ Pending

---

### AC-11: El estado del contract debe ser válido

**Pasos:**
1. Abrir modal de edición.
2. **Verificar**: el select "Estado inicial" solo muestra "Borrador" y "Activo".
3. NO muestra "expiring", "expired", "terminated" en las opciones.

**Status:** ⏳ Pending

---

### AC-12: La estrategia de renovación debe ser válida

**Pasos:**
1. Abrir modal de edición.
2. **Verificar**: el select "Renovación" muestra "Manual", "Automática", "No renovar".

**Status:** ⏳ Pending

---

### AC-13: El botón "Guardar" se deshabilita durante el PATCH

**Pasos:**
1. Abrir modal de edición.
2. DevTools → Throttling → Slow 3G.
3. Cambiar algún campo. Click "Guardar".
4. **Verificar**: el botón muestra spinner + "Guardando…" y está disabled.

**Status:** ⏳ Pending

---

### AC-14: Toast honesto de éxito o error

**Pasos:**
1. Abrir modal de edición. Cambiar el campo "Notas" a "TEST-AC14 update".
2. Click "Guardar".
3. **Verificar**: toast "✓ Contrato actualizado: {address} — {tenant}".
4. El modal se cierra.
5. **Re-abrir** el mismo contract en edición.
6. **Verificar**: el campo "Notas" muestra "TEST-AC14 update" (persistido).

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Editar un contract legacy con `rentAmount = 0`

```powershell
# Setup: forzar un contract con rent_amount=0
UPDATE contracts SET rent_amount = 0 WHERE id = 'LEGACY_ID';
```

**Pasos:**
1. Abrir el modal de edición de ese contract.
2. **Verificar**: el campo "Canon mensual" está en 0 (NO se autollenó).

**Status:** ⏳ Pending

---

### EC-2: Server tarda >15s (Slow 3G)

**Pasos:**
1. DevTools → Throttling → Slow 3G.
2. Abrir modal de edición. Click "Guardar".
3. **Esperado**: si el server tarda >15s → AbortController + toast "El servidor tardó demasiado".
4. Modal NO se cierra.

**Status:** ⏳ Pending

---

### EC-3: La propiedad del contract ya NO existe

```powershell
# Setup: borrar una propiedad usada por un contract
DELETE FROM properties WHERE id = 'DELETED_PROP_ID';
```

**Pasos:**
1. Abrir el modal de edición de un contract que apuntaba a esa propiedad.
2. Click "Guardar".
3. **Verificar**: toast 400 "La propiedad DELETED_PROP_ID no existe".
4. Modal NO se cierra.

**Status:** ⏳ Pending

---

### EC-4: Cambiar propiedad a una SIN tenant activo

**Pasos:**
1. Abrir el modal de edición de un contract.
2. Cambiar la propiedad a una que NO tenga tenant activo.
3. **Verificar**: los campos "Canon mensual" y "Administración PH" quedan vacíos.
4. El select "Inquilino" no se autoselecciona (puede quedar el anterior).

**Status:** ⏳ Pending

---

### EC-5: Múltiples tenants "Activos" para la misma propiedad

**Pasos:**
1. (Setup manual en phpMyAdmin) Insertar 2 tenants con `property_id=X` y `status='Activo'`.
2. Abrir el modal de edición de un contract que apunte a X.
3. **Verificar**: el `tenants.find` toma el primero. Comportamiento determinístico.

**Status:** ⏳ Pending

---

### EC-6: Cambiar la propiedad pero la nueva no tiene `driveFolderId`

**Pasos:**
1. Abrir el modal de edición de un contract.
2. Cambiar la propiedad a una SIN `drive_folder_id` en la DB.
3. **Verificar**: el auto-fill SÍ funciona (solo lee de tenants, no de Drive).
4. El form se actualiza correctamente.

**Status:** ⏳ Pending

---

### EC-7: Server devuelve 409 (edición concurrente)

**Pasos:**
1. Abrir el modal de edición en 2 navegadores distintos (mismo contract).
2. Browser A: cambiar "Canon" a 1500000, click "Guardar" → éxito.
3. Browser B (sin recargar): cambiar "Canon" a 2000000, click "Guardar".
4. **Verificar**: el server devuelve 409 con `{ error: '...' }`.
5. Toast de error. Modal NO se cierra.

**Status:** ⏳ Pending

---

### EC-8: Editar un contract con status='terminated'

**Pasos:**
1. Setup: forzar un contract con `status='terminated'`.
2. Abrir el modal de edición.
3. **Verificar**: el select "Estado" muestra el valor actual 'terminated' (no se asume draft/active).
4. **Decisión**: ¿se permite cambiar de terminated a active? El spec dice SÍ (out of scope validar transiciones). El test verifica el comportamiento actual.

**Status:** ⏳ Pending

---

## Resumen de ejecución

| Check | Status | Notas |
|-------|--------|-------|
| PRE-1 | ⏳ | health check |
| AC-1 | ⏳ | modal se abre pre-llenado |
| AC-2 | ⏳ | auto-fill al cambiar propiedad |
| AC-3 | ⏳ | no pisar valores del user |
| AC-4 | ⏳ | auto-fill al mount |
| AC-5 | ⏳ | no auto-fill en edición |
| AC-6 | ⏳ | auto-fill al cambiar tenant |
| AC-7 | ⏳ | PATCH preserva todos los campos |
| AC-8 | ⏳ | try/catch + JSON |
| AC-9 | ⏳ | validación numérica inline |
| AC-10 | ⏳ | endDate >= startDate |
| AC-11 | ⏳ | status enum |
| AC-12 | ⏳ | renewal enum |
| AC-13 | ⏳ | botón disabled durante PATCH |
| AC-14 | ⏳ | toast honesto |
| EC-1 | ⏳ | rent=0 legacy |
| EC-2 | ⏳ | timeout 15s |
| EC-3 | ⏳ | property borrada |
| EC-4 | ⏳ | sin tenant activo |
| EC-5 | ⏳ | múltiples tenants |
| EC-6 | ⏳ | sin driveFolderId |
| EC-7 | ⏳ | 409 conflicto |
| EC-8 | ⏳ | status=terminated |

**Veredicto final:**
- ✅ ALL PASS → listo para commit + push
- ❌ N FAIL → volver a Fase 4 (implementación)

## Historial de ejecuciones

| Fecha | Commit deployado | Pass / Total | Notas |
|-------|------------------|--------------|-------|
| 2026-07-23 | baseline | 0/23 | primera ejecución — esperamos ver varios FAILs |
