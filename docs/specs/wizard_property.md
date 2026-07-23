# Feature: Wizard de Captación de Propiedad (3 pasos → finalize)

> **Karpathy Spec** — Julio 2026. Define QUÉ debe hacer el wizard de
> propiedad. NO incluye código de implementación. Una vez aprobado,
> sigue `tests/verifiers/wizard_property.md`.

## 1. User Story

**As a** agente inmobiliario de InmoControl,
**I want to** captar una propiedad en 3 pasos (Datos → Documentos → Inventario) y finalizarla con un click,
**So that** la propiedad queda persistida en MySQL desde el paso 1 (no solo al finalizar) Y los documentos suben a Google Drive en tiempo real Y un modal de resumen me muestra exactamente qué se guardó y qué quedó pendiente.

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: Click "Continuar a Documentación" persiste en MySQL inmediatamente
- Al hacer click en "Continuar a Documentación" en step 1 con datos válidos
  (address, chip AAA+7-8, folio, ≥1 owner con nombre),
  se ejecuta `POST /api/properties` con `localId: wizard-X` + `status='Pendiente'`.
- Si el POST responde 200: aparece UNA fila nueva en `properties` con
  `status='Pendiente'` y el wizard avanza a step 2.
- El toast muestra: "✓ Avance guardado en el servidor (MySQL). Estado: Pendiente hasta subir el Mandato."

### AC-2: Click "Guardar avance (este equipo)" también persiste (no solo localStorage)
- Al hacer click en "💾 Guardar avance (este equipo)" con datos válidos,
  se ejecuta el mismo `POST /api/properties` que AC-1.
- Toast: "✓ Avance guardado en el servidor (MySQL). Estado: Pendiente hasta subir el Mandato."
- NO dice "guardado en este navegador" (esa copia está prohibida — fue causa de
  bugs en julio 2026).

### AC-3: Phone y email del primer owner se guardan en tabla `properties` (legacy columns)
- Después de AC-1, los campos `properties.owner_phone` y `properties.owner_email`
  contienen los valores del primer owner (no NULL).
- Verificable con `SELECT owner_phone, owner_email FROM properties WHERE id = ?;`

### AC-4: El POST a /api/properties tiene timeout de 15s en el cliente
- Si el server no responde en 15s, el `AbortController` aborta el fetch.
- Toast de error: "El servidor tardó demasiado. Reintentá en unos segundos."
- El botón "Continuar a Documentación" queda habilitado para reintento.

### AC-5: Cada llamada a Google Drive en el server tiene timeout de 8s
- `oauth2Client.refreshAccessToken()` tiene timeout de 8s.
- `drive.files.list/create/update` tienen timeout de 8s.
- Si Drive está caído, el server devuelve 200 con `driveFolderId: null` y
  loguea warning. **El tenant/propiedad se guarda igual en MySQL.**

### AC-6: Top-level try/catch en POST /api/properties
- CUALQUIER error no manejado en el handler devuelve JSON con
  `{ error: "..." }` y status 500.
- NUNCA devuelve HTML (eso fue el bug del 22-jul-2026 donde el browser
  tiraba "SyntaxError: Unexpected token '<'").

### AC-7: Modal de confirmación "Continuar a Inventario" muestra pendientes honestamente
- Al hacer click en "Continuar a Inventario" desde step 2, si faltan docs
  requeridos, aparece un modal con la lista explícita de qué falta.
- El modal tiene 2 botones: "Subir los pendientes" (vuelve a step 2) y
  "Sí, continuar con N pendiente(s)" (avanza a step 3).
- La propiedad queda como Pendiente hasta que se suba el Mandato.

### AC-8: Step 2 (Documentos) muestra badge de estado del storage por card
- Cada `DocCard` muestra un badge explícito:
  - 🟢 **En Drive** si la URL del archivo es `https://drive.google.com/...`
  - 🟠 **Pendiente → Drive** si la URL es `blob:...`
  - ⚪ vacío si no hay archivo
- El badge se deriva de la URL real, no de un flag manual.

### AC-9: Upload en step 2 va a Drive en tiempo real (no diferido)
- Al subir un PDF en step 2 con Drive conectado, el archivo se sube a
  Drive INMEDIATAMENTE (no espera al finalize).
- Si Drive responde OK, la URL se guarda como `https://drive.google.com/...`
  en `uploadedDocs` y el badge cambia a 🟢 "En Drive".
- Si Drive está caído, se guarda como `blob:` URL local con badge 🟠
  "Pendiente → Drive" y se sube al finalize.

### AC-10: Modal "¿Querés subir otro documento?" permite encadenar N PDFs
- Después de subir un PDF, aparece un modal que pregunta "¿Querés subir
  otro documento?" con botones "No, ya está" y "Sí, subir otro".
- El slot acepta N archivos (varios PDFs para un mismo slot).

### AC-11: Finalizar el wizard NO re-crea la propiedad
- Al hacer click en "Finalizar" en step 3, NO se ejecuta un INSERT
  nuevo. Se ejecuta un UPSERT (`POST /api/properties` con `localId: <UUID real>`)
  que actualiza con mandate + docs + status.
- Si el mandate está firmado, status = 'Activo'. Si no, status = 'Pendiente'.

### AC-12: Modal de resumen post-finalize persiste hasta ser cerrado
- Al finalizar, aparece un modal con 4 secciones:
  - 🟢 En Google Drive (lista)
  - 🟠 Solo en este navegador (lista, si hubo)
  - ❌ Faltantes — no subiste (lista, si hubo)
  - 🔴 Errores (si hubo)
- El modal NO se auto-dismiss. Tiene botones "Ver carpeta en Drive" y "Cerrar".

### AC-13: Discard del wizard borra la propiedad de MySQL
- Al hacer click en "Descartar borrador" después de haber persistido
  (AC-1), se ejecuta `DELETE /api/properties/:id`.
- El server responde 200 (o 409 si ya tiene inventarios, en cuyo caso
  solo se limpia el state local).
- El wizard vuelve al step 1 con state limpio.

### AC-14: El wizard state se restaura desde localStorage con wizardPropertyDbId
- Si el user cierra el browser a mitad del wizard, al reabrir se
  restaura: address, chip, folio, owners, units, **wizardPropertyDbId**.
- Si wizardPropertyDbId está presente, no se crea una nueva propiedad —
  se reconecta a la existente (AC-1 es idempotente).

### AC-15: NUNCA se persisten blob URLs a MySQL (drive URL o nada)
- Cuando el user sube un doc y Drive está desconectado, el archivo NO
  se guarda en `property_documents.file_url` con un `blob:` URL.
- En su lugar, el card queda en estado "no subido" (sin entrada en DB)
  y el badge muestra 🟠 "Pendiente → Drive" con texto "Conectá tu Drive
  para subirlo".
- **Razón**: blob URLs expiran al refrescar el browser. Si se persisten,
  el archivo "se pierde" — el card muestra "Ver" pero el PDF viewer dice
  "Es posible que se haya movido, editado o eliminado". Eso fue el bug
  reportado el 23-jul-2026 (3 docs perdidos).
- Aplica tanto al **wizard** (step 2) como al **Detalle del Inmueble**
  (post-creación) y a **Carga de Mandato** desde el detalle.

**Implementación (jul-2026) — defensa en 3 capas**:
1. **Cliente** (`PropertiesView.tsx` Caso B línea ~640): antes del POST a
   `/api/properties`, validar que `docUrl` NO empiece con `blob:` o `data:`.
   Si empieza, log warning y NO persistir. Mostrar toast claro.
2. **Cliente** (`handleFinalize` línea ~1071): cambiar la fuente de verdad
   de `wizardFiles` a `uploadedDocs` (que SÍ persiste en localStorage).
   Si un slot tiene URL de Drive, reusarla. Si tiene blob URL sin File
   en memoria (refresh), loguear y seguir — el agente re-sube desde el Detalle.
3. **Server** (`server/routes/properties.ts` línea ~478): validación final
   que rechaza `url.startsWith('blob:')` o `url.startsWith('data:')` con
   log warning. Es la red de seguridad por si el cliente se equivoca.

**UI honesta del Detalle del Inmueble**: si una fila en `property_documents`
tiene `file_url` con `blob:` (cualquier zombie previo a este fix), el
Detalle NO muestra "Ver" verde. En su lugar, muestra un botón ámbar
"Re-subir" + tooltip "Archivo previo perdido (URL local expirada) — re-subí
para acceder". El Contrato de Mandato específicamente muestra un badge
rojo "⚠ Archivo perdido" porque su pérdida es más grave (afecta status
Activo de la propiedad).

**Sanear filas existentes**: ver `scripts/clean-blob-property-documents.sql`.
Lista filas zombie agrupadas por propiedad, tiene el DELETE comentado para
ejecutar cuando el user esté listo, y un SELECT de verificación post-limpieza.

### AC-16: Las URLs de Drive persistidas siempre son válidas
- Si un doc se subió a Drive y se persistió su `webViewLink`, hacer
  click en "Ver" SIEMPRE debe abrir el PDF en el visor.
- Si Drive devuelve el archivo pero la URL no se puede abrir (file
  not found, 404, etc.), el card debe mostrar badge 🔴 "Archivo no
  disponible en Drive" en vez de pretender que está todo bien.
- **Razón**: bug del 23-jul-2026 — 2 docs (Certificado Garaje 19 +
  Contrato de Mandato) se subieron y persistieron como "Ver" pero el
  visor decía "Es posible que se haya movido, editado o eliminado".
  La URL en la DB no correspondía a un archivo accesible. Fix:
  verificar al renderizar (HEAD request o patrón en la URL) y mostrar
  estado real.
- **Acción inmediata**: cuando un doc se sube, guardar también
  `drive_file_id` (no solo `webViewLink`). Al renderizar, si la URL
  falla, intentar regenerar el link con `drive.files.get({fileId, fields: 'webViewLink'})`.

### AC-17: Discard de borrador también limpia archivos huérfanos en Drive
- Si el user clickea "Descartar borrador" después de haber subido docs
  a Drive (sin finalizar), los archivos subidos al Drive de la
  propiedad deben borrarse o moverse a "papelera".
- **Razón**: bug del 23-jul-2026 — cuando el discard borró la propiedad
  de MySQL + la carpeta de Drive, los archivos que ya se habían
  subido también se borraron. Pero el user no sabía que se borraron
  y no los tenía respaldados localmente. Fix: pedir confirmación
  explícita al discard si hay docs en Drive ("Vas a perder N archivos
  ya subidos. ¿Continuar?").

## 3. Edge Cases

### Error States

- **Drive API timeout** (EC-1): server responde 200 con `driveFolderId: null`
  en ≤10s. La propiedad se guarda en MySQL. Toast: "Drive no disponible —
  el archivo se guardó localmente."
- **MySQL timeout** (EC-2): server devuelve 500 JSON con mensaje claro. Toast
  en el cliente: "Error de conexión con el servidor."
- **Body del POST mal formado** (EC-3): server devuelve 400 JSON. Toast
  en el cliente muestra el error del server.
- **Network offline** (EC-4): el fetch del cliente se aborta por timeout (15s).
  Toast: "El servidor tardó demasiado. Reintentá en unos segundos."

### Empty States

- **Sin documentos subidos** (EC-5): el badge de cada card es ⚪ vacío.
- **Sin propietarios** (EC-6): el botón "Continuar a Documentación" muestra
  toast "Agregá al menos un propietario con nombre" y NO avanza.
- **Sin número de cédula** (EC-7): no bloquea (es opcional).

### Loading States

- **Durante el POST de creación** (EC-8): el botón "Continuar a Documentación"
  muestra spinner + "Guardando..." y está disabled. El user NO puede
  hacer doble click.
- **Durante upload a Drive en step 2** (EC-9): la card muestra spinner
  + "Subiendo a Drive...". Las otras cards siguen operables.
- **Durante upload en step 2 (Caso C del wizard)** (EC-10): `uploadingDoc`
  está set al slotKey. El toast dice "Subiendo..." mientras espera.

### Edge Cases del flujo

- **User cierra el browser a mitad** (EC-11): al reabrir, el draft
  se restaura. wizardPropertyDbId persiste si ya estaba persistido.
- **User hace "Atrás" después de "Continuar"** (EC-12): el state se preserva.
  El user puede volver a step 1 sin perder datos.
- **User hace click 2 veces rápido en "Guardar"** (EC-13): el segundo click
  no dispara otro POST porque el botón está disabled durante el primero.

## 4. Technical Contract

### Endpoint: POST /api/properties

```typescript
// Request
interface CreatePropertyRequest {
  localId?: string;            // "wizard-X" para INSERT, UUID para UPSERT
  address: string;             // required
  chip: string;                // required, formato AAA + 7-8 chars
  folio: string;               // required
  ownerName: string;           // required, nombre del primer owner
  ownerIdNumber?: string;      // cédula del primer owner (legacy)
  ownerPhone?: string;         // ← CELULAR (top-level, no solo en owners[])
  ownerEmail?: string;         // ← EMAIL (top-level, no solo en owners[])
  propertyType: 'apartamento' | 'casa' | 'apartaestudio' | 'oficina' | 'local' | 'bodega' | 'finca' | 'otro';
  status?: 'Pendiente' | 'Activo';
  mandatePdfUrl?: string;
  mandateSignedAt?: string;   // ISO 8601
  owners?: Array<{
    id?: string;
    name: string;
    idNumber?: string;
    phone?: string;
    email?: string;
    ownershipPct?: number;     // 0-100
    position: number;          // 1-based
  }>;
  units?: Array<{
    id?: string;
    type: 'parking' | 'storage' | 'other';
    label: string;
    folioMatricula?: string;
    areaM2?: number;
    position: number;
  }>;
  documents?: Record<string, string | { primary: string; extras: string[] }>;
}

// Response (200 OK)
interface CreatePropertyResponse {
  success: true;
  propertyId: string;          // UUID real
  driveFolderId: string | null;
  driveFolderPath: string | null;
  message: string;
}

// Response (400/409/500 — SIEMPRE JSON)
interface ErrorResponse {
  error: string;               // mensaje legible
  // otros campos opcionales
}
```

### Componentes del cliente (props relevantes)

```typescript
interface PropertiesViewState {
  // Wizard state
  showWizard: boolean;
  step: 1 | 2 | 3;
  address: string;
  chip: string;
  folio: string;
  propertyType: PropertyType;
  wizardOwners: WizardOwner[];
  wizardUnits: WizardUnit[];
  wizardInventory: Inventory | null;
  uploadedDocs: Record<slotKey, string[]>;  // URLs (drive.google.com o blob:)

  // ID local del wizard (cambia entre sesiones)
  wizardPropertyId: string;     // "wizard-${Date.now()}"

  // IDs reales del server (null hasta que se persiste)
  wizardPropertyDbId: string | null;       // ← UUID real
  wizardDriveFolderId: string | null;
  wizardDriveFolderPath: string | null;

  // UI state
  uploadingDoc: string | null;
  currentDocLabel: string | null;
  lastUploadedSlot: string | null;
  viewingDoc: { label: string; url: string } | null;
  finalizeSummary: FinalizeSummary | null;
  confirmDiscardDraft: boolean;
}

interface FinalizeSummary {
  address: string;
  driveFolderId: string | null;
  driveFolderPath: string | null;
  driveConnected: boolean;
  uploadedToDrive: string[];
  uploadedLocalOnly: string[];
  missingDocs: string[];
  failedUploads: string[];
  inventoryUploaded: boolean;
  totalDocs: number;
}
```

## 5. Timeouts (explícitos)

| Capa | Operación | Timeout |
|------|-----------|---------|
| Server | `oauth2Client.refreshAccessToken()` | 8s |
| Server | `drive.files.list` | 8s |
| Server | `drive.files.create` | 8s |
| Server | `drive.files.update` | 8s |
| Server | `pool.query()` (MySQL) | sin timeout explícito, depende de la conexión |
| Cliente | `fetch('/api/properties')` | 15s via AbortController |
| Cliente | `fetch('/api/tenants')` | 15s via AbortController |

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| AC-1 éxito | success | `✓ Avance guardado en el servidor (MySQL). Estado: Pendiente hasta subir el Mandato.` |
| AC-1 error | error | `Error guardando en servidor: {error del server}` |
| AC-1 timeout 15s | error | `El servidor tardó demasiado. Reintentá en unos segundos.` |
| AC-9 upload Drive éxito | success | `✓ {filename} subido a Drive` |
| AC-9 upload Drive falla | error | `Error al subir a Drive ({error}); guardado localmente. Reintentá al finalizar.` |
| AC-9 Drive no conectado | error | `Documento guardado localmente (Drive no conectado). Se subirá cuando conectes tu Drive.` |
| AC-11 finalize éxito | success | `✓ ¡Propiedad creada! Resumen abajo.` |
| AC-11 finalize con pendientes | error | `⚠ Propiedad creada con N pendiente(s). Resumen abajo.` |
| AC-11 finalize error | error | `Error guardando propiedad: {error}` |
| AC-13 discard éxito | success | `Borrador descartado. Empezás de cero.` |
| EC-7 cédula vacía | (no toast, silent) | n/a |
| EC-8 cargando | success | `✓ Avance guardado en el servidor (MySQL). Estado: Pendiente hasta subir el Mandato.` |
| Drive warning (no fatal) | warning (no error) | `[Drive] getFreshDriveClient falló (continuando sin Drive): {error}` (console, no toast) |

## 7. Dependencias

### Archivos a modificar (potencialmente)
- `src/features/properties/PropertiesView.tsx` (el monolito, 3158 líneas)
- `src/features/properties/components/StepBasic.tsx`
- `src/features/properties/components/StepDocs.tsx`
- `src/features/properties/components/StepInventory.tsx`
- `server/routes/properties.ts`
- `src/lib/drive/driveService.ts` (si el fix toca el cliente)
- `scripts/debug-prod-properties.ps1` (puede ser útil para verificar)

### Archivos a NO tocar (out of scope)
- `db/mysql/migrations/` (a menos que se identifique schema drift REAL)
- `src/features/contracts/` (refactor mayor pendiente)
- Cualquier feature nuevo que no esté en este spec

## 8. Out of Scope

- Refactor del monolito `PropertiesView.tsx` (Fase 2 del proyecto).
- Instalación de Vitest (decisión pendiente per AGENTS.md).
- Multi-tenant real.
- Real-time upload a Drive de los docs del step 2 (NO, está fuera de scope
  — el spec original lo cubría pero este spec mantiene el comportamiento
  actual "diferido al finalize" para minimizar cambios. **Espera, este
  ES scope** — ver AC-9).

## 9. Riesgos identificados

- **Drive timeout en cascada**: si Google está lento, TODOS los uploads
  se cuelgan. Mitigación: `withTimeout(8s, ...)` en cada llamada.
- **Orphan Pendiente properties**: si user abandona a mitad del wizard,
  queda fila huérfana. Mitigación: `discardDraft` hace DELETE.
- **Browser cache**: el bundle cacheado puede hacer parecer que los fixes
  no están. Mitigación: `Ctrl+Shift+R` después del deploy.
- **Doble POST por doble click**: el botón se deshabilita durante el POST.
- **Wizard state inconsistente**: si el user edita el address después de
  persistir, no se vuelve a persistir hasta el finalize. Esto es by design.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, jul-2026)
**Fecha de aprobación:** 2026-07-23 (AC-15 ampliado con 3 capas de defensa tras bug de blob URLs en property_documents)
