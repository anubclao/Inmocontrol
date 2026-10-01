# Fix #6: Refactor TenantsView.tsx (1910 → <200 por archivo)

> **Severidad**: 🟠 P1. Stack: `src/features/tenants/`.
> **Esfuerzo**: ~3h. 2 commits.
> **Status**: ⏳ Pendiente (Karpathy FASE 2 — no tocar código hasta aprobación).
> **Actualizado**: 2026-09-30. Refinado a 10 archivos después de mapear el monolito.

## Contexto

`TenantsView.tsx` tiene **1910 líneas** (≈9× el límite de 200 que pone AGENTS.md). Contiene:

- 1 componente principal `TenantsView` (líneas 63-1990)
- 5 modales inline (Create, ConfirmCreate, Edit, ViewDetail, Delete, UploadAnother) + 1 overlay (PlacementInventory) + 1 wrapper (BillingWizard) + 1 mount (ActaEntregaModal)
- 3 helpers de Drive: `ensureTenantDriveFolder`, `refreshCedulaStatus`, `refreshActaStatus`
- Lógica de form de create: `validateForm`, `handleAskCreate`, `handleConfirmAndCreate`, `handleIdNumberChange`, `handleCloseCreate`, `formatColombianPhone`
- Lógica de upload: `handleDocUpload`, `fileToBase64`
- Filtros: `filteredTenants`, `availableProperties`, `propertyIdsWithActiveTenant`, `isPropertyAvailable`, `getPropertyAddress`, `activeTenants`, `inactiveTenants`
- Tipos: `Tenant`, `TenantsViewProps`

**Violación AGENTS.md**: "Componentes <200 líneas" — el archivo tiene 1910. Y la regla "1 archivo <200, no monolito" no se respeta.

**Caller único**: `src/App.tsx:5` (`import { TenantsView } from "./features/tenants/TenantsView"`) + uso en `App.tsx:230` como `<TenantsView ...props />`. El path importado es el archivo `.tsx` raíz, NO la convención `TenantsView/index.tsx`. → **No hace falta re-export shim**: el archivo `TenantsView.tsx` se queda donde está, solo se reduce de tamaño.

## 1. User Story

**As a** desarrollador de InmoControl,
**I want to** que `TenantsView.tsx` pese menos de 250 líneas y que la lógica de modales/hooks viva en su propio archivo,
**So that** (a) cumpla AGENTS.md, (b) cada modal sea testeable/grep-able de forma aislada, y (c) el `git blame` y los code reviews apunten al archivo correcto en vez de "línea 1342 de TenantsView.tsx".

## 2. Estado actual (estructura, 1910 líneas)

```
src/features/tenants/TenantsView.tsx
├── imports (1-37)
├── Tenant interface (39-48)
├── TenantsViewProps interface (50-58)
├── TenantsView component (63-1990)
│   ├── ensureTenantDriveFolder (92-145)
│   ├── refreshCedulaStatus (153-180)
│   ├── refreshActaStatus (186-201)
│   ├── handleConfirmDeleteTenant (210-237)
│   ├── validateForm (340-403)
│   ├── handleAskCreate (405-410)
│   ├── handleConfirmAndCreate (412-565)
│   ├── handleIdNumberChange (567-583)
│   ├── handleCloseCreate (585-595)
│   ├── openPlacementInventory (597-614)
│   ├── fileToBase64 (616-622)
│   ├── handleDocUpload (627-723)
│   ├── activeTenants/inactiveTenants (725-731)
│   ├── Create Modal JSX (737-857)
│   ├── ConfirmCreate Modal JSX (870-960)
│   ├── Edit Modal JSX (962-1140)
│   ├── View Detail Modal JSX (1140-1500)
│   ├── Lista + Stats JSX (1500-1690)
│   ├── Placement Inventory Overlay JSX (1696-1830)
│   ├── Billing Wizard JSX (1830-1850)
│   ├── Acta Modal mount (1850-1880)
│   ├── Delete Tenant Modal JSX (1880-1900)
│   └── UploadAnotherDoc Modal JSX (1900-1990)
```

## 3. Aceptación

### AC-1: Estructura target (10 archivos)

```
src/features/tenants/
├── TenantsView.tsx                  # lista + stats + state principal (200-250 líneas)
├── types.ts                         # Tenant, TenantsViewProps, UploadFolderStatus, ActaStatus
├── ActaEntregaModal.tsx             # ya existe, sin cambios
├── hooks/
│   ├── useTenantDrive.ts            # ensure + refresh + uploadStatus (180-200 líneas)
│   └── useCreateTenant.ts           # form state + validate + submit (180-200 líneas)
└── modals/
    ├── CreateTenantModal.tsx        # form con useCreateTenant (180-200 líneas)
    ├── ConfirmCreateModal.tsx       # confirmación pre-guardar (60-80 líneas)
    ├── EditTenantModal.tsx          # edit form (140-160 líneas)
    ├── ViewTenantModal.tsx          # detail + docs + acta (180-200 líneas)
    ├── DeleteTenantModal.tsx        # delete confirm (40-60 líneas)
    ├── UploadAnotherDocModal.tsx    # "¿subir otro?" (60-80 líneas)
    └── PlacementInventoryOverlay.tsx # overlay con StepInventory (180-200 líneas)
```

### AC-2: `TenantsView.tsx` < 250 líneas

- Solo contiene: state de modales (viewingTenant, editingTenant, tenantToDelete, placement\*, billingWizardContract), filtros (`filteredTenants`, `availableProperties`, `propertyIdsWithActiveTenant`, `isPropertyAvailable`, `getPropertyAddress`, `activeTenants`, `inactiveTenants`), y el render de la lista + stats + mount de los modales.
- NO contiene: la lógica del form de create (va a `useCreateTenant`), la lógica de upload/Drive (va a `useTenantDrive`), ni el JSX de los modales (van a `modals/*.tsx`).

### AC-3: `types.ts` centraliza los types

- `Tenant` (movido desde TenantsView:39-48)
- `TenantsViewProps` (movido desde TenantsView:50-58)
- `UploadFolderStatus`, `UploadStatusMap` (extraídos del inline `Record<string, { uploading?, files[] }>`)
- `ActaStatus` (extraído del inline `{ fileId?, webViewLink? } | null`)
- `DriveFolder` union type (`"Cedula" | "Contrato" | "Recibos"`)

### AC-4: `useCreateTenant.ts` encapsula el form de create

- Recibe: `properties`, `tenants`, `onAddTenant`, `onUpdateProperty`, `showToast`.
- Devuelve: `{ form, formErrors, isCreateModalOpen, confirmCreateOpen, creatingTenant, handleAskCreate, handleConfirmAndCreate, handleIdNumberChange, handleCloseCreate, setIsCreateModalOpen, setConfirmCreateOpen }`.
- Internamente: usa `useState` para form/formErrors, llama `validateForm`, hace el POST a `/api/tenants` con timeout 15s (FIX 2026-07-22), maneja el caso 409 (duplicado) y el caso "PATCH a propiedad falla" (BUG-023).

### AC-5: `useTenantDrive.ts` encapsula Drive

- Recibe: `showToast`, opcionalmente un `currentTenant` para refresh automático.
- Devuelve: `{ uploadStatus, actaStatus, lastUploadedFolder, pendingFolderForAnother, ensureTenantDriveFolder, refreshCedulaStatus, refreshActaStatus, handleDocUpload, triggerUploadAnother, setViewingTenant }`.
- 3 funciones puras en él: `ensureTenantDriveFolder` (con `silent` param), `refreshCedulaStatus`, `refreshActaStatus`.
- 1 handler: `handleDocUpload` (incluye `fileToBase64` como helper interno).
- Estado interno: `uploadStatus` (Record<DriveFolder, UploadFolderStatus>), `actaStatus` (ActaStatus | null), `lastUploadedFolder` (DriveFolder | null), `pendingFolderForAnother` (DriveFolder | null).

### AC-6: `CreateTenantModal.tsx` < 200 líneas

- Componente "tonto": recibe props de `useCreateTenant` y las pasa al JSX del form.
- Renderiza: `Modal` con título "Nuevo Arrendatario", `Input` x 5 (nombre, cédula, email, celular, canon, admin), select de inmueble con lógica de disponibilidad inline.
- El `ConfirmCreateModal` se renderiza desde acá (es su submachine de confirmación) — recibe `isOpen`, `onClose`, `onConfirm`, `form`, `properties`, `creatingTenant`.

### AC-7: `EditTenantModal.tsx` < 200 líneas

- Recibe: `tenant`, `onSave: (updates) => Promise<boolean>`, `onClose`, `showToast`.
- Estado interno: `editingTenant` (copia del tenant que se va modificando).
- Renderiza: form con 6 inputs + select de status.
- El botón Guardar Cambios llama `onSave` con los updates saneados (adminFee parseado, etc.) y muestra toast según el resultado.

### AC-8: `ViewTenantModal.tsx` < 200 líneas

- Recibe: `tenant`, `properties`, `showToast`, `getPropertyAddress`, y todo lo de `useTenantDrive`.
- Renderiza: header con avatar+nombre+cédula, grid de contacto+inmueble+canon, banner del acta (condicional), sección "Inventario de Colocación" con botón, sección "Documentos en Google Drive" con 3 folder cards (Cedula/Contrato/Recibos) + card de Acta, botón Cerrar.
- Dispara `onPlacementClick` cuando se clickea "Abrir Inventario de Colocación" (eso lo maneja el padre porque necesita cargar `placementBaseInventory` desde IndexedDB).

### AC-9: `DeleteTenantModal.tsx` < 100 líneas

- Recibe: `tenant`, `deleting`, `onConfirm`, `onClose`.
- Renderiza: texto de confirmación + 2 botones (Cancelar / Eliminar).

### AC-10: `UploadAnotherDocModal.tsx` < 100 líneas

- Recibe: `folder`, `fileCount`, `onUploadAnother`, `onClose`.
- Renderiza: "Subiste 1 archivo a X" + texto explicativo + 2 botones (No, ya está / Sí, subir otro).

### AC-11: `ConfirmCreateModal.tsx` < 100 líneas

- Recibe: `form`, `properties`, `creatingTenant`, `onConfirm`, `onClose`.
- Renderiza: banner ámbar de warning + resumen de los datos del form + 2 botones (Modificar / Sí, guardar).

### AC-12: `PlacementInventoryOverlay.tsx` < 200 líneas

- Recibe: `property`, `viewingTenant`, `baseInventory`, `onBack`, `onComplete`, `showToast`, `propertyType`.
- Renderiza: header con "← Volver" + título "Inventario de Colocación" + subtítulo con nombre del arrendatario y dirección + warning si no hay baseInventory + `<StepInventory>` con los props correctos.
- El callback `onComplete` viene de TenantsView porque ahí se hace el flip a "Arrendado" + creación de contrato + apertura de BillingSetupWizard.

### AC-13: Imports limpios

- `TenantsView.tsx` no importa `motion/react`, `motion` solo en su JSX. (Verificar que motion sigue donde corresponde — solo se usa en el wrapper del TenantsView root).
- `TenantsView.tsx` no importa `StepInventory`, `inventoryDB`, `createContractServer`, `useContractStore`, `BillingSetupWizard` — todo eso queda en `PlacementInventoryOverlay.tsx` o donde corresponda.
- `TenantsView.tsx` no importa `formatCurrency`, `formatIdNumber`, `formatTenantName` directamente — van solo donde se usan (ViewTenantModal, CreateTenantModal, etc).

### AC-14: Cero cambio funcional observable

- `git diff` semántico: el output de las funciones puras y el comportamiento de los modales debe ser idéntico al monolito.
- Las 1910 líneas se REDISTRIBUYEN entre los 10 archivos, no se borran.
- El módulo de arrendatarios sigue funcionando end-to-end (crear, ver detalle, editar, eliminar, subir docs, generar acta, abrir inventario de colocación, billing wizard).

### AC-15: Backward compatibility

- `import { TenantsView } from "./features/tenants/TenantsView"` desde `App.tsx:5` sigue funcionando.
- `TenantsView` sigue siendo un named export.
- Las props de `TenantsView` (`showToast`, `tenants`, `properties`, `onAddTenant`, `onUpdateTenant`, `onDeleteTenant`, `onUpdateProperty`, `role`) no cambian.

## 4. Edge Cases

### E-1: Orden de commits

- **Commit 1**: `refactor(tenants): modales de create/edit/delete + useCreateTenant (commit 1/2 fix-issue-06)` — extrae types + useCreateTenant + 5 modales (Create, ConfirmCreate, Edit, Delete, UploadAnother). TenantsView todavía tiene el View modal + Drive + Placement overlay inline.
- **Commit 2**: `refactor(tenants): ViewTenantModal + useTenantDrive + PlacementInventoryOverlay (commit 2/2 fix-issue-06)` — extrae useTenantDrive + ViewTenantModal + PlacementInventoryOverlay. TenantsView queda como lista + stats + state compartido + modales (que ya son todos extraídos).

### E-2: Hook de Drive y `setViewingTenant`

- `ensureTenantDriveFolder` modifica `viewingTenant.tenantDriveFolderId` cuando crea la carpeta. El state `viewingTenant` vive en TenantsView. El hook necesita una forma de setearlo → opción (a): el hook recibe `onFolderCreated?: (tenantId, folderId) => void` como prop, y TenantsView pasa un wrapper que setea el state. Más directo que pasar `setViewingTenant` adentro del hook.

### E-3: `StepInventory` y los props que recibe

- `PlacementInventoryOverlay` recibe `baseInventory` desde TenantsView. El padre (TenantsView) es quien hace el `await inventoryDB.getInventory(inicialId)` antes de montar el overlay. Esto mantiene la lógica de async loading en TenantsView y el overlay puro.

### E-4: `BillingSetupWizard` y `createContractServer`

- Ambos viven en TenantsView porque su callback `onComplete` (del PlacementInventory) necesita:
  1. Crear el contrato con `createContractServer` y agregarlo al store.
  2. Flip del status de la propiedad a "Arrendado" vía `onUpdateProperty`.
  3. Abrir el `BillingSetupWizard` con el contrato nuevo.
- Esos 3 pasos NO viven en `PlacementInventoryOverlay` (sería un side effect demasiado lejos del componente presentacional). El overlay solo llama `onComplete(contract?)` y TenantsView hace los 3 pasos.

### E-5: tsc + module resolution

- `import { TenantsView } from "./features/tenants/TenantView"` desde App.tsx sigue resolviendo a `TenantsView.tsx` (no a `TenantsView/index.tsx`).
- **Verificación**: tsc --noEmit debe pasar.

### E-6: Bundle size

- El refactor **no debe aumentar el bundle**. Mover código entre archivos del mismo package no debería afectar tree-shaking.
- **Verificación**: `npm run build:client` antes y después — tolerancia ±10 KB (10 archivos en vez de 1).

## 5. Technical Contract

### Archivos creados (9 nuevos + 1 modificado)

```typescript
// src/features/tenants/types.ts (~70 líneas)
export type DriveFolder = "Cedula" | "Contrato" | "Recibos";
export type ActaStatus = { fileId?: string; webViewLink?: string } | null;
export interface UploadFolderStatus {
  uploading?: boolean;
  files: Array<{ name: string; link?: string; webViewLink?: string; fileId?: string }>;
}
export type UploadStatusMap = Record<DriveFolder, UploadFolderStatus>;
export interface Tenant { id: string; name: string; idNumber: string; ... }
export interface TenantsViewProps { showToast, tenants, properties, ... }
```

```typescript
// src/features/tenants/hooks/useCreateTenant.ts (~190 líneas)
export function useCreateTenant(deps: {
  properties, tenants, onAddTenant, onUpdateProperty, showToast,
}) {
  // form, formErrors, isCreateModalOpen, confirmCreateOpen, creatingTenant state
  // validateForm, handleAskCreate, handleConfirmAndCreate, handleIdNumberChange, handleCloseCreate
  // formatColombianPhone helper
  return { form, formErrors, isCreateModalOpen, setIsCreateModalOpen, ... };
}
```

```typescript
// src/features/tenants/hooks/useTenantDrive.ts (~200 líneas)
export function useTenantDrive(deps: {
  showToast, onFolderCreated?: (tenantId: string, folderId: string) => void,
}) {
  // uploadStatus, actaStatus, lastUploadedFolder, pendingFolderForAnother state
  // ensureTenantDriveFolder, refreshCedulaStatus, refreshActaStatus, handleDocUpload
  // fileToBase64 helper, triggerUploadAnother helper
  return { uploadStatus, actaStatus, lastUploadedFolder, ..., ensureTenantDriveFolder, ... };
}
```

```typescript
// src/features/tenants/modals/CreateTenantModal.tsx (~190 líneas)
export function CreateTenantModal(props: {
  properties;
  isOpen;
  onClose;
  useCreateTenantResult;
}) {
  /* form JSX + ConfirmCreateModal nested */
}
```

```typescript
// src/features/tenants/modals/ConfirmCreateModal.tsx (~80 líneas)
export function ConfirmCreateModal(props: {
  isOpen;
  form;
  properties;
  creatingTenant;
  onConfirm;
  onClose;
}) {
  /* banner + summary + 2 buttons */
}
```

```typescript
// src/features/tenants/modals/EditTenantModal.tsx (~150 líneas)
export function EditTenantModal(props: {
  isOpen;
  tenant;
  onSave;
  onClose;
  showToast;
}) {
  /* edit form JSX */
}
```

```typescript
// src/features/tenants/modals/ViewTenantModal.tsx (~200 líneas)
export function ViewTenantModal(props: {
  isOpen;
  tenant;
  properties;
  showToast;
  getPropertyAddress;
  useTenantDriveResult;
  onPlacementClick;
}) {
  /* detail + docs list + acta + buttons */
}
```

```typescript
// src/features/tenants/modals/DeleteTenantModal.tsx (~50 líneas)
export function DeleteTenantModal(props: {
  isOpen;
  tenant;
  deleting;
  onConfirm;
  onClose;
}) {
  /* confirmation + 2 buttons */
}
```

```typescript
// src/features/tenants/modals/UploadAnotherDocModal.tsx (~70 líneas)
export function UploadAnotherDocModal(props: {
  isOpen;
  folder;
  fileCount;
  onUploadAnother;
  onClose;
}) {
  /* "¿Querés subir otro?" */
}
```

```typescript
// src/features/tenants/modals/PlacementInventoryOverlay.tsx (~190 líneas)
export function PlacementInventoryOverlay(props: {
  isOpen;
  property;
  viewingTenant;
  baseInventory;
  propertyType;
  onBack;
  onComplete;
  showToast;
}) {
  /* overlay + StepInventory */
}
```

```typescript
// src/features/tenants/TenantsView.tsx (refactorizado, ~230 líneas)
export function TenantsView(props: TenantsViewProps) {
  // viewingTenant, editingTenant, tenantToDelete, placement*, billingWizardContract state
  // useCreateTenant + useTenantDrive
  // handleConfirmDeleteTenant, openPlacementInventory, handlePlacementComplete
  // filteredTenants, availableProperties, propertyIdsWithActiveTenant, isPropertyAvailable, getPropertyAddress
  // activeTenants, inactiveTenants
  // render: lista + stats + modales
}
```

## 6. Timeouts explícitos

- **N/A** para este refactor. Los timeouts existentes (15s en POST /api/tenants, 30s en upload de doc) se mantienen tal cual en los hooks.

## 7. Tostadas exactas (copy approved)

> **N/A**. No se agregan ni modifican toasts. Se redistribuyen.

## 8. Dependencias

### Archivos a crear (9)

1. `src/features/tenants/types.ts`
2. `src/features/tenants/hooks/useCreateTenant.ts`
3. `src/features/tenants/hooks/useTenantDrive.ts`
4. `src/features/tenants/modals/CreateTenantModal.tsx`
5. `src/features/tenants/modals/ConfirmCreateModal.tsx`
6. `src/features/tenants/modals/EditTenantModal.tsx`
7. `src/features/tenants/modals/ViewTenantModal.tsx`
8. `src/features/tenants/modals/DeleteTenantModal.tsx`
9. `src/features/tenants/modals/UploadAnotherDocModal.tsx`
10. `src/features/tenants/modals/PlacementInventoryOverlay.tsx`

### Archivos a modificar (1)

- `src/features/tenants/TenantsView.tsx` (1910 → ~230 líneas)

### Archivos a NO tocar

- `src/features/tenants/ActaEntregaModal.tsx` (ya existe y se importa tal cual)
- `src/features/tenants/actaEntregaPdf.ts`
- `src/App.tsx` (sigue importando `TenantsView` desde el mismo path)
- `src/features/properties/components/StepInventory/*` (se consume desde PlacementInventoryOverlay)

## 9. Out of Scope

- ❌ No se cambia el comportamiento de ningún modal (copy, validaciones, timeouts).
- ❌ No se migra a `apiRequest` (FIX 028 ya está aplicado en otros módulos pero este archivo usa `fetch` directo en algunos lugares; queda como está en el refactor para minimizar el diff).
- ❌ No se agrega `errorHandler` en el cliente (FIX 027 es server-side).
- ❌ No se divide `CreateTenantModal` en sub-componentes más pequeños (es presentacional, no amerita más split).

## 10. Cómo verificar (referencia al verifier)

Ver `tests/verifiers/fix-issue-06-refactor-tenants-view.md`.
