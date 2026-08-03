# Feature: Wizard de Creación de Arrendatario (Crear + Cédula + Colocación)

> **Karpathy Spec** — Julio 2026. Define QUÉ debe hacer el flujo del tenant
> en InmoControl. NO incluye código de implementación. Una vez aprobado,
> sigue `tests/verifiers/wizard_tenant.md`.

## 1. User Story

**As a** agente inmobiliario de InmoControl,
**I want to** captar un arrendatario en un flujo unificado (Crear + Cédula + Inventario de Colocación + Acta de Entrega),
**So that** el tenant quede persistido en MySQL desde el primer paso Y la cédula se suba a Drive en tiempo real Y el Inventario de Colocación se pueda firmar sin perder el contexto legal Y el Acta de Entrega quede disponible cuando corresponda.

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: Modal "Nuevo Arrendatario" valida campos obligatorios antes de enviar

- Campos obligatorios: nombre, cédula/NIT, propertyId, rent.
- Si falta alguno → toast de error y NO se cierra el modal.
- La cédula debe ser única por organización (chequeo server-side con 409 si ya existe).

### AC-2: Modal queda ABIERTO durante el POST (no se cierra antes del server)

- El botón "Crear" muestra spinner + "Creando…" y se deshabilita.
- El user NO puede hacer doble click.
- Si el POST tarda >15s → AbortController aborta, toast "El servidor tardó demasiado", botón se rehabilita.

### AC-3: Al crear OK → modal se cierra + toast honesto

- Toast: "✓ {nombre} creado — completa el Inventario de Colocación para activar la propiedad".
- El tenant se persiste en MySQL con `status='Activo'`.
- Si Drive está conectado, se crea la carpeta del tenant automáticamente.
- Se setea `tenantDriveFolderId` en el state local.

### AC-4: Subir Cédula del tenant va a Drive en tiempo real

- Click "Subir PDF" en la card de Cédula del Detalle del Inquilino.
- Si Drive está conectado → upload a Drive → badge 🟢 "En Drive".
- Si Drive está desconectado → no sube, toast: "Reconectá Drive y reintentá la subida".
- El archivo se persiste en `property_documents` con `file_url=https://drive.google.com/...` (NO `blob:`).

### AC-5: La cédula se refresca desde Drive al abrir el Detalle

- Al abrir el Detalle del Inquilino, `refreshCedulaStatus` consulta los archivos en la carpeta `Cédula/` del tenant en Drive.
- Si encuentra archivos → los muestra en la lista de la card.
- Si no encuentra → muestra el botón "Subir PDF" como si nunca se hubiera subido.

### AC-6: El Inventario de Colocación tiene TODAS las firmas antes de generar el contrato

- El Inventario de Colocación requiere 2 firmas: arrendatario + agente.
- El botón "Firmar Inventario" está disabled hasta que ambas firmas se capturen.
- La firma del propietario NO se requiere acá (eso es el Contrato de Mandato y el Contrato de Arrendamiento).

### AC-7: Al firmar el Inventario de Colocación se crea el contrato automáticamente

- El handler `onComplete` del StepInventory de Colocación:
  1. Crea el contrato en MySQL con `status='active'` (no 'draft').
  2. Flipea la propiedad a `status='Arrendado'`.
  3. Abre el `BillingSetupWizard` para configurar la `BillingPolicy` + generar la primera amortización.
- Si el server falla al crear el contrato, igual flipea el status (el inventario SÍ se firmó).

### AC-8: El `BillingSetupWizard` se abre después de firmar el Inventario

- Después del paso 7, se abre el wizard con la policy pre-llenada (canon + admin del contrato).
- **Si la propiedad YA tiene `BillingPolicy`** (consultado al server al abrir): el wizard se abre normalmente pero el botón "Guardar y generar amortización" está `disabled` y muestra `connected=true`. El agente puede cerrar con "Más tarde" o ver la policy existente.
- **Si NO tiene**: el wizard se abre con el botón enabled. El agente puede configurar o cancelar (queda contrato sin policy, banner en BillingPanel).

### AC-9: El Acta de Entrega se genera desde el Detalle del Inquilino

- Click "Generar acta" en la card de Acta → abre `ActaEntregaModal`.
- El modal pide los datos del estado físico (servicios, llaves, observaciones).
- Al confirmar: genera el PDF, lo sube a `Acta/` en Drive, toast: "✓ Acta de Entrega guardada en Drive → {nombre}/Acta/".
- Si Drive no está conectado → no genera, toast "Drive no disponible".

### AC-10: El Acta NO bloquea la facturación

- El banner del Acta en el Detalle dice explícitamente "No bloquea facturación".
- El Acta es opcional. El tenant puede estar activo sin acta.

### AC-11: Top-level try/catch + JSON errors (consistencia con wizard_property)

- Cualquier error no manejado en los handlers devuelve JSON con `{ error: "..." }` y status 500.
- NUNCA devuelve HTML (esa fue la causa del bug de "SyntaxError: Unexpected token '<'" el 22-jul-2026).

### AC-12: Drive operations tienen timeout de 8s server-side

- `oauth2Client.refreshAccessToken()` tiene timeout 8s.
- `drive.files.list/create/update` tienen timeout 8s.
- Si Drive está caído o token expirado → server devuelve 503 con error específico (no 500 genérico).

### AC-13: Cliente Drive operations tienen timeout 15s via AbortController

- Cada `fetch` al server (que toca Drive del lado del server) tiene AbortController de 15s.
- Si el server no responde → AbortController aborta, toast "El servidor tardó demasiado".

### AC-14: El botón "Generar acta" se deshabilita durante la subida

- El botón muestra spinner + "Generando…" mientras se sube a Drive.
- El user NO puede hacer doble click.

### AC-15: El estado de Drive se chequea al abrir el Detalle

- Cuando se abre el Detalle del Inquilino, se chequea el status de Drive (`useGoogleDriveStore.checkStatus`).
- Si está expirado → banner persistente "Tu sesión de Google Drive expiró" (fix `47a8272`).
- Si está desconectado → banner "Google Drive no está conectado".

### AC-16: El flow de "Abandonar wizard" limpia el state local

- Si el user cierra el modal de "Nuevo Arrendatario" sin confirmar → el form se resetea.
- NO se hace ningún POST parcial (idempotente).
- Si el POST ya se hizo y el user abre el wizard de nuevo → empieza con form vacío.

## 3. Edge Cases

### EC-1: El user clickea "Crear" con un nombre que tiene solo espacios

- El form valida `name.trim() === ''` y muestra error inline.
- NO se envía el POST.

### EC-2: La cédula ya existe (otro tenant en la misma org)

- El server devuelve 409 Conflict con `{ error: 'Ya existe un inquilino con esa cédula en la organización' }`.
- Toast de error con el mensaje del server. Modal NO se cierra.

### EC-3: El server tarda más de 15s (ej: Drive refresh lento)

- AbortController aborta a los 15s.
- Toast: "El servidor tardó demasiado. Reintentá en unos segundos."
- Modal NO se cierra. Botón se rehabilita.

### EC-4: El user sube una cédula que NO es PDF

- El input `accept=".pdf,image/*"`. Si elige otro tipo, el server puede rechazarlo con 400.
- Toast de error con el mensaje del server.

### EC-5: El Inventario de Colocación se firma PERO el server está caído

- El handler `onComplete` captura el error.
- Toast: "Inventario firmado, pero no se pudo crear el contrato. Contactá al admin: {error}".
- El status de la propiedad igual se flipea a 'Arrendado' (porque el inventario SÍ se firmó).

### EC-6: El user abre el modal "Generar acta" pero cancela

- El modal se cierra. NO se genera PDF. NO se sube nada.
- El Acta sigue en estado "no generada". El banner ámbar del Detalle sigue visible.

### EC-7: La carpeta del tenant ya existe en Drive (se creó antes)

- `ensureTenantDriveFolder` chequea primero. Si existe, devuelve el ID sin crear.
- Idempotente — no falla si se llama 2 veces.

### EC-8: El user abre el Detalle del Inquilino sin Drive conectado

- `ensureTenantDriveFolder` falla con 400 "No hay conexión con Google Drive".
- `refreshCedulaStatus` y `refreshActaStatus` no hacen nada (porque no hay folderId).
- El banner persistente del DriveStatusBanner muestra el mensaje (no toast rojo gritón).
- El user puede igual subir la cédula (que se guardará como local-only si reintenta, pero el flujo principal lo bloquea).

### EC-9: El user crea un tenant pero la propiedad NO está en MySQL

- El server valida la FK: 400 "La propiedad X no existe".
- Toast de error claro. NO se crea el tenant.

### EC-10: El user quiere crear un tenant con `adminFee` que tiene solo espacios

- El form valida y muestra error inline "Ingresa la cuota en pesos (COP) — solo números".
- NO se envía el POST.

## 4. Technical Contract

### Endpoint: POST /api/tenants

```typescript
// Request
interface CreateTenantRequest {
  id?: string; // UUID o null
  name: string; // required, trim
  documentId: string; // required, único por org
  email?: string;
  phone?: string;
  propertyId: string; // required, FK
  rent: number;
  adminFee?: number; // default 0
  leaseStartDate?: string; // ISO 8601 date
}

// Response (201 Created)
interface CreateTenantResponse {
  success: true;
  tenant: Tenant;
  tenantDriveFolderId: string | null; // null si Drive no conectado
  message: string;
}

// Response (400/409/500 — SIEMPRE JSON)
interface ErrorResponse {
  error: string;
  // otros campos opcionales
}
```

### Endpoint: POST /api/tenants/:id/ensure-drive-folder

```typescript
// Request: vacío (o { propertyId? })
// Response 200: { success: true, tenantDriveFolderId, created: boolean, message }
// Response 400: { error: 'No hay conexión con Google Drive. Conectá Drive en Configuración.' }
// Response 404: { error: 'Inquilino no encontrado' }
```

### Endpoint: GET /api/tenants/:id/documents?folder={Cedula|Acta|Contrato|Recibos}

```typescript
// Response 200: { files: Array<{ id, name, webViewLink, size, mimeType }> }
```

### Endpoint: POST /api/tenants/upload-acta

```typescript
// Request: { tenantDriveFolderId, fileName, base64Data }
// Response 200: { fileId, webViewLink }
// Response 400: { error }
```

### Componentes del cliente (props relevantes)

```typescript
interface TenantsViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
  tenants: Tenant[];
  properties: Property[];
  onAddTenant: (tenant: any) => void;
  onUpdateTenant: (id: string, updates: any) => Promise<boolean>;
  onDeleteTenant: (id: string) => Promise<void>;
  onUpdateProperty: (id: string, updates: any) => void;
  role: Role | null;
}

interface TenantFormState {
  name: string;
  idNumber: string;
  email: string;
  phone: string;
  propertyId: string;
  rent: string; // string en el form, se parsea a number al enviar
  adminFee: string; // string en el form
}

interface CreateTenantInternalState {
  isCreateModalOpen: boolean;
  creatingTenant: boolean; // spinner
  form: TenantFormState;
  formErrors: Record<string, string>;
  confirmCreateOpen: boolean; // modal intermedio
}
```

## 5. Timeouts (explícitos)

| Capa    | Operación                                       | Timeout                              |
| ------- | ----------------------------------------------- | ------------------------------------ |
| Server  | `oauth2Client.refreshAccessToken()`             | 8s                                   |
| Server  | `drive.files.list`                              | 8s                                   |
| Server  | `drive.files.create`                            | 8s                                   |
| Server  | `drive.files.update`                            | 8s                                   |
| Server  | `pool.query()` (MySQL)                          | sin timeout explícito                |
| Cliente | `fetch('/api/tenants')`                         | 15s via AbortController              |
| Cliente | `fetch('/api/tenants/:id/ensure-drive-folder')` | 15s via AbortController              |
| Cliente | `fetch('/api/tenants/:id/documents')`           | 10s via AbortController              |
| Cliente | `fetch('/api/tenants/upload-acta')`             | 30s via AbortController (PDF grande) |

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                                  | Tipo               | Copy exacto                                                                          |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| AC-3 éxito                               | success            | `✓ ${name} creado — completa el Inventario de Colocación para activar la propiedad`  |
| AC-3 cédula duplicada                    | error              | `Ya existe un inquilino con esa cédula. Verificá los datos.`                         |
| AC-3 error genérico                      | error              | `Error al crear arrendatario: ${error del server}`                                   |
| AC-3 timeout 15s                         | error              | `El servidor tardó demasiado. Reintentá en unos segundos.`                           |
| AC-4 upload OK                           | success            | `✓ Cédula subida a Drive`                                                            |
| AC-4 Drive no conectado                  | error              | `Reconectá Drive y reintentá la subida.`                                             |
| AC-4 error upload                        | error              | `Error al subir: ${error del server}`                                                |
| AC-7 Inventario firmado                  | success            | `Inventario de colocación firmado — contrato creado, propiedad ahora Arrendada`      |
| AC-7 Inventario firmado + contrato falló | error              | `Inventario firmado, pero no se pudo crear el contrato. Contactá al admin: ${error}` |
| AC-9 acta OK                             | success            | `✓ Acta de Entrega guardada en Drive → ${nombre}/Acta/`                              |
| AC-9 acta error                          | error              | `Error al guardar en Drive: ${error}`                                                |
| EC-2 cédula duplicada                    | error              | `Ya existe un inquilino con esa cédula en la organización`                           |
| Drive warning                            | warning (no error) | `[Drive] getFreshDriveClient falló (continuando sin Drive): ${error}` (console)      |

## 7. Dependencias

### Archivos a modificar (potencialmente)

- `src/features/tenants/TenantsView.tsx` (modal de Crear, handleConfirmAndCreate, refreshCedulaStatus, refreshActaStatus, ActaEntregaModal integration)
- `src/features/tenants/ActaEntregaModal.tsx` (upload del PDF)
- `src/features/contracts/ContractsView.tsx` (creación automática de contrato al firmar inventario)
- `src/features/properties/PropertiesView.tsx` (flipear status a 'Arrendado')
- `server/routes/tenants.ts` (POST /api/tenants, ensure-drive-folder, upload-acta)
- `src/shared/store/appStore.ts` (addTenant: persistencia)
- `src/features/billing/components/BillingSetupWizard.tsx` (integración desde el flujo)

### Archivos a NO tocar (out of scope)

- `db/mysql/schema-hostinger.sql` (no hay cambios de schema)
- `src/features/auth/*` (no relacionado)
- `src/features/alerts/*` (no relacionado)

## 8. Out of Scope

- Wizard de **edición** de tenant (ya existe modal de Edit con Cuota Admin agregada en `79062cf`).
- Wizard de **eliminación** de tenant (el botón trash existe, fuera de scope).
- **Inventario de Captación** (ese es de la propiedad, no del tenant).
- **Renovación automática** de contratos.
- **Pagos parciales** del billing (eso es el wizard_billing, ya especificado en AC-1/2/3/4/5 del BillingSetupWizard).

## 9. Riesgos identificados

- **Race condition entre Drive checks**: el `useGoogleDriveStore.checkStatus` se ejecuta al mount, pero el token puede expirar después. `ensureTenantDriveFolder` puede fallar aunque el store diga "conectado".
- **Doble click en "Crear"**: el botón se deshabilita durante el POST, pero un user muy rápido podría hacer 2 POSTs si la red es lenta. El server es idempotente (chequea por cédula duplicada), pero igual genera tráfico.
- **Browser cache**: el bundle cacheado puede hacer parecer que los fixes no están. Mitigación: `Ctrl+Shift+R` después del deploy.
- **Wizard state inconsistente**: si el user edita el adminFee después de crear el tenant, debe re-abrir el modal de Edit. By design.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03 (AC-8 alineado con AC-7: BillingSetupWizard abre con botón disabled si ya hay policy, no se cierra)
