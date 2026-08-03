# Feature: Wizard de Contrato de Arrendamiento (Edición + Auto-fill)

> **Karpathy Spec** — Julio 2026. Define QUÉ debe hacer el flujo del
> contrato de arrendamiento en InmoControl. NO incluye código de
> implementación. Una vez aprobado, sigue `tests/verifiers/wizard_contract.md`.

> **⚠️ Importante**: El botón "+ Nuevo Contrato" del módulo Contratos
> está OCULTO a propósito (ver AGENTS.md líneas 87-102). El contrato
> se genera AUTOMÁTICAMENTE al firmar el Inventario de Colocación. El
> módulo Contratos solo permite EDITAR contratos existentes. Este
> spec cubre **el modal de edición/creación** que se dispara desde
> otros lugares (ej: el botón de editar en la fila del contrato).

## 1. User Story

**As a** agente inmobiliario de InmoControl,
**I want to** editar un contrato existente con auto-fill inteligente al elegir la propiedad,
**So that** el canon y la cuota de administración se pre-rellenen desde el tenant activo de esa propiedad Y no tenga que tipearlos a mano Y se respete la edición manual del usuario (no se pisa).

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: Modal "Editar Contrato" se abre desde la fila del contrato
- En el módulo Contratos, click en el ícono de "Editar" (lápiz) de una fila → abre el modal.
- El modal viene pre-llenado con los valores del contract: propertyId, tenantId, rentAmount, adminFee, commissionPct, insurancePct, startDate, endDate, renewalStrategy, status, inventoryEndRequired, notes.

### AC-2: Al elegir una propiedad, se autocompletan canon y adminFee desde el tenant activo
- Cuando el user cambia `propertyId` en el select:
  1. Se busca el tenant activo de esa propiedad (`t.propertyId === propertyId && t.status === 'Activo'`).
  2. Si se encuentra:
     - Se setea `tenantId` al ID del tenant.
     - Se pre-rellenan `rentAmount` y `adminFee` con los valores del tenant.
- Si la propiedad NO tiene tenant activo → los campos quedan vacíos.

### AC-3: NO pisar valores que el user ya tocó (regla "no override")
- Si el form actual ya tiene `rentAmount > 0` o `adminFee > 0` antes de cambiar la propiedad, **NO sobrescribir**.
- Mismo patrón que el `onTenantChange` existente (ver `ContractsView.tsx:352-363`).

### AC-4: Auto-fill al mount del modal (no solo al cambiar)
- Si el form se inicializa con una `propertyId` y un `tenantId` (constructor default o edición), el `useEffect` se dispara con los valores y pre-rellena si están en 0.
- Implementado con `useEffect` que se dispara cuando `propertyId` o `tenantId` cambian.

### AC-5: Cuando se edita un contrato existente, NO se dispara el auto-fill
- Si `contract` está presente (caso de edición), el `useEffect` se SALTA.
- Los valores del contract se respetan aunque `rentAmount` o `adminFee` sean 0 (caso legacy).

### AC-6: Al cambiar el tenant, también se autocompletan los valores
- `onTenantChange` actual (línea 355-363) sigue funcionando igual.
- Si el user cambia el tenant después de elegir la propiedad, los valores se re-rellenan desde el nuevo tenant (respetando "no override").

### AC-7: El PATCH al server preserva TODOS los campos editados
- El botón "Guardar" del modal arma el body con todos los campos: `propertyId, tenantId, rentAmount, adminFee, commissionPct, insurancePct, startDate, endDate, renewalStrategy, status, inventoryEndRequired, notes`.
- El server acepta el PATCH y actualiza MySQL.
- Toast honesto de éxito o error.

### AC-8: Top-level try/catch + JSON errors
- Cualquier error no manejado devuelve JSON con `{ error: "..." }` y status 500.
- NUNCA devuelve HTML.

### AC-9: Validación inline de campos numéricos
- `rentAmount` debe ser >= 0. Si negativo, error inline y NO se envía.
- `adminFee` debe ser >= 0. Si negativo, error inline y NO se envía.
- `commissionPct` debe estar entre 0 y 30.
- `insurancePct` debe estar entre 0 y 20.

### AC-10: La fecha de fin debe ser >= fecha de inicio
- Si `endDate < startDate`, error inline y NO se envía.
- Mensaje claro: "La fecha de fin debe ser posterior a la fecha de inicio."

### AC-11: El estado del contract debe ser válido
- Solo acepta: `'draft'` o `'active'`.
- El select muestra solo esas 2 opciones.

### AC-12: La estrategia de renovación debe ser válida
- Solo acepta: `'manual'`, `'auto'`, o `'none'`.
- El select muestra solo esas 3 opciones.

### AC-13: El botón "Guardar" se deshabilita durante el PATCH
- El botón muestra spinner + "Guardando…" mientras se hace el PATCH.
- El user NO puede hacer doble click.

### AC-14: Toast honesto de éxito o error al guardar
- Éxito: `✓ Contrato actualizado: {property.address} — {tenant.name}`.
- Error: `Error al guardar el contrato: ${error del server}`.
- Modal NO se cierra en error (para reintento).

## 3. Edge Cases

### EC-1: El user edita un contract legacy con `rentAmount = 0`
- El `useEffect` se dispara con `contract` presente → se SALTA el auto-fill.
- El form mantiene `rentAmount = 0` (como está en la DB).
- El user puede editar manualmente.

### EC-2: El server tarda más de 15s
- AbortController aborta a los 15s.
- Toast: "El servidor tardó demasiado. Reintentá en unos segundos."
- Modal NO se cierra.

### EC-3: La propiedad del contract ya NO existe (borrada por otro agente)
- El PATCH devuelve 400 con `{ error: 'La propiedad X no existe' }`.
- Toast de error. Modal NO se cierra.

### EC-4: El user cambia la propiedad del contract a una SIN tenant activo
- El auto-fill no encuentra tenant → los campos quedan vacíos.
- El user puede editarlos manualmente.

### EC-5: Hay múltiples tenants "Activos" para la misma propiedad
- Caso no debería pasar (un tenant activo por propiedad), pero si pasa, tomamos el primero.
- `tenants.find(...)`.

### EC-6: El user cambia la propiedad pero la propertyId nueva no tiene `driveFolderId`
- El auto-fill solo toca los campos del form, NO toca Drive.
- El form se actualiza, los valores se pre-rellenan, el modal sigue abierto.

### EC-7: El server devuelve 409 Conflict (otro agente editó el mismo contract)
- El PATCH devuelve 409 con `{ error: 'El contrato fue modificado por otro usuario. Recargá la página.' }`.
- Toast de error. El modal puede ofrecer un botón "Recargar y comparar".

### EC-8: El user abre el modal de edición para un contract con status='terminated'
- El form se inicializa con los valores del contract.
- El select de "Estado inicial" solo permite 'draft' o 'active'. Si el status es 'terminated', el form lo muestra como 'terminated' en el select.
- **Decisión a tomar**: ¿permitimos cambiar de 'terminated' a 'active'? Por ahora SÍ, pero el server debería validar.

## 4. Technical Contract

### Endpoint: PATCH /api/contracts/:id

```typescript
// Request (cualquier subset de campos)
interface UpdateContractRequest {
  propertyId?: string;
  tenantId?: string | null;
  rentAmount?: number;
  adminFee?: number;
  commissionPct?: number;
  insurancePct?: number;
  startDate?: string;
  endDate?: string;
  noticeDate?: string;
  status?: 'draft' | 'active' | 'expiring' | 'expired' | 'terminated';
  renewalStrategy?: 'auto' | 'manual' | 'none';
  inventoryEndRequired?: boolean;
  notes?: string;
  contractPdfUrl?: string;
  signedAt?: string;
}

// Response 200: { contract: <row de MySQL> }
// Response 400: { error }
// Response 404: { error: 'Contrato no encontrado' }
// Response 409: { error }
```

### Componentes del cliente (props relevantes)

```typescript
interface ContractFormProps {
  contract?: Contract;
  onClose: () => void;
  onSave: (contract: Contract) => void;
  properties: any[];
  tenants: any[];
}

interface ContractFormState {
  form: Contract;
  saving: boolean;
  // NO tracking de "user touched" — usamos la heurística de rentAmount > 0
}
```

## 5. Timeouts (explícitos)

| Capa | Operación | Timeout |
|------|-----------|---------|
| Server | `pool.query()` (MySQL) | sin timeout explícito |
| Cliente | `fetch('/api/contracts/:id')` (PATCH) | 15s via AbortController |
| Cliente | `fetch('/api/contracts')` (GET lista) | 10s via AbortController |

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| AC-1 éxito | success | `✓ Contrato actualizado: ${property.address} — ${tenant.name}` |
| AC-1 error genérico | error | `Error al guardar el contrato: ${error del server}` |
| AC-1 timeout 15s | error | `El servidor tardó demasiado. Reintentá en unos segundos.` |
| AC-1 conflict 409 | error | `El contrato fue modificado por otro usuario. Recargá la página.` |
| EC-3 propiedad no existe | error | `La propiedad ${propertyId} no existe` |
| EC-10 fecha inválida | error | `La fecha de fin debe ser posterior a la fecha de inicio` (inline) |
| EC-2 servidor caído | warning (no error) | `[contract save] error: ${error}` (console) |

## 7. Dependencias

### Archivos a modificar (potencialmente)
- `src/features/contracts/ContractsView.tsx` (ContractForm, onPropertyChange, useEffect, handleSave)
- `server/routes/entities.ts` (PATCH /api/contracts/:id — ya existe, chequear que valida los campos)
- `src/shared/store/appStore.ts` (updateContract: persistencia)

### Archivos a NO tocar (out of scope)
- Wizard de creación de contratos (los contratos se crean automáticamente al firmar el Inventario de Colocación, ver `wizard_tenant.md`).
- `db/mysql/schema-hostinger.sql` (no hay cambios).
- `src/features/properties/*` (no relacionado).
- `src/features/billing/*` (no relacionado).

## 8. Out of Scope

- Crear contratos manualmente desde el módulo Contratos (el botón "+ Nuevo Contrato" está oculto por decisión legal).
- Generar el PDF del contrato (eso es del billing, no del wizard de edición).
- Subir el PDF firmado del contrato (eso es otro wizard).
- Editar el `tenantId` (cambiar el tenant de un contrato existente es complejo y tiene implicaciones legales — está disabled en el form).

## 9. Riesgos identificados

- **Race condition entre auto-fill y user edit**: el `useEffect` se dispara con `[]` deps, así que solo en el mount. Si el user cambia la propiedad y luego cambia los valores, NO se pisan (regla "no override").
- **Edición concurrente**: 2 agentes editando el mismo contract → 409 conflict. El form no tiene merge; el segundo agente tiene que recargar.
- **PDF firmado perdido**: si el user edita un contract que ya tiene PDF firmado (`contractPdfUrl`), el form NO lo borra. Pero el cambio de `rentAmount` no actualiza el PDF — el user tendría que regenerar el PDF.
- **Status 'terminated' reversible**: si el user cambia de 'terminated' a 'active', podría romper la lógica de billing. Mitigación: el server debería validar las transiciones de status.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03
