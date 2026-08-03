# Verifier: Fix BUG-005 — useEffect auto-fill en ContractsView

> **Karpathy Verifier** — Agosto 2026. Cada AC de
> `docs/specs/fix-bug-005-contracts-autofill.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un check
> falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io` (DB `u652436213_inmocontrol`)
- Browser con DevTools (F12 → Console + Network + React DevTools si está instalado) en incógnito
- Para los tests: una propiedad con `status='En Colocación'` y un tenant activo asignado.

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

### AC-1: El useEffect se re-dispara cuando `tenants` o `properties` cambian

**Pasos:**
1. DevTools → Sources → buscar `ContractsView.tsx`.
2. **Verificar**: las deps del useEffect son `[form.propertyId, tenants, properties, contract]`.
3. **Verificar**: NO es `[]`.
4. DevTools → React (si instalado) → Components → ContractFormModal.
5. **Verificar**: el effect se ejecuta al mount (1ra vez).
6. **Verificar (simulando hidratación tardía)**: con el modal ya abierto, ejecutar en DevTools Console:
   ```js
   // Simular que el store recibió los tenants
   window.__forceUpdate && window.__forceUpdate();
   ```
   Si no hay helper, forzar un re-render modificando el state de otro componente que dispare el `useStore`.
7. **Verificar**: el effect se ejecutó de nuevo (logs en consola si agregamos `console.debug`).
8. **Verificar**: si el user NO tocó los campos, se re-rellenaron `rentAmount` y `adminFee` desde el tenant activo de la propiedad seleccionada.

**Status:** ⏳ Pending

---

### AC-2: Regla "no override" preservada

**Pasos:**
1. Abrir el modal "Nuevo Contrato".
2. Esperar a que el modal se abra con valores pre-llenados (caso normal: tenants ya hidratados).
3. Tipear manualmente `rentAmount = 999999` (forzar un valor distinto al del tenant).
4. Esperar 3-5 segundos (por si llega hidratación tardía).
5. **Verificar**: `rentAmount` sigue siendo `999999` (NO se sobrescribió con el del tenant).

**Status:** ⏳ Pending

---

### AC-3: Modo edición (contract presente) NO se ve afectado

**Pasos:**
1. Ir a Contratos. Abrir un contrato existente (botón "Editar" de una fila).
2. **Verificar**: el modal abre con los valores del contract (incluso si son 0 por legacy).
3. Esperar 3-5 segundos.
4. **Verificar**: los valores del contract NO cambian (no se pisan con datos del tenant activo).

**Status:** ⏳ Pending

---

### AC-4: setForm con función updater

**Pasos:**
1. DevTools → Sources → buscar `ContractsView.tsx:393-401`.
2. **Verificar**: el `setForm` se llama con una función: `setForm((f) => ({ ... }))`.
3. **Verificar**: NO se usa `setForm({ ...form, ... })` (forma con objeto directo).

**Status:** ⏳ Pending

---

### AC-5: Eliminación (o justificación) del `eslint-disable-next-line`

**Pasos:**
1. DevTools → Sources → buscar `ContractsView.tsx:393-401`.
2. **Verificar**: si el `eslint-disable-next-line react-hooks/exhaustive-deps` se mantiene, hay un comentario al lado justificando por qué.
3. **Verificar**: si se eliminó, no hay warning de lint sobre deps incompletas.

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Hidratación tardía

**Pasos:**
1. Hard refresh (Ctrl+Shift+R) con la red en Slow 3G (DevTools → Throttling).
2. Inmediatamente, navegar a Contratos y abrir "Nuevo Contrato".
3. **Verificar**: el modal abre con campos vacíos (aún no hidrató).
4. Esperar 3-5s a que hidrate.
5. **Verificar**: los campos se re-rellenan automáticamente con los valores del tenant activo de la propiedad pre-seleccionada (si la hay).

**Status:** ⏳ Pending

---

### EC-2: Cambio de propiedad

**Pasos:**
1. En el modal, cambiar el dropdown de propiedad a OTRA que tenga tenant activo distinto.
2. **Verificar**: `rentAmount`, `adminFee`, `tenantId` se actualizan con los valores del nuevo tenant activo.
3. **Verificar**: si la nueva propiedad NO tiene tenant activo, los campos quedan vacíos.

**Status:** ⏳ Pending

---

### EC-3: Cambio de tenant

**Pasos:**
1. En el modal, cambiar el dropdown de tenant a otro distinto.
2. **Verificar**: el handler `onTenantChange` actualiza `rentAmount` y `adminFee` respetando "no override".

**Status:** ⏳ Pending

---

### EC-4: Edición de contrato existente

**Pasos:**
1. Abrir modal con un contract existente.
2. **Verificar**: el useEffect retorna inmediatamente por `if (contract) return;`.
3. **Verificar**: los valores del contract (incluso si son 0 por legacy) NO se pisan.

**Status:** ⏳ Pending

---

## Resumen

| Tipo | Cantidad |
|------|----------|
| Pre-checks | 1 (PRE-1) |
| Acceptance Criteria | 5 (AC-1 a AC-5) |
| Edge Cases | 4 (EC-1 a EC-4) |
| **Total checks** | **10** |

---

## Aprobación

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]
