# Feature: Wizard de Inventario (Captación + Colocación + Final)

> **Karpathy Spec** — Julio 2026. Define QUÉ debe hacer el flujo de
> inventarios de InmoControl. NO incluye código de implementación.
> Una vez aprobado, sigue `tests/verifiers/wizard_inventory.md`.

## 1. User Story

**As a** agente inmobiliario de InmoControl,
**I want to** generar inventarios en 3 fases (Captación, Colocación, Final) con un wizard unificado,
**So that** cada transición de estado de la propiedad quede documentada legalmente (entrega inicial, entrega al inquilino, devolución final) Y las firmas se capturen en el momento correcto Y los PDFs firmados se suban a Drive automáticamente.

## 2. Conceptos clave (contexto del dominio)

### Tipos de inventario (fases)

| Fase | Cuándo se genera | Quién firma | Output |
|------|------------------|-------------|--------|
| **Captación** (inicial) | Wizard de propiedad, step 3 | Propietario + agente (2 firmas) | `inventory_captacion_pdf_url` |
| **Colocación** (final al entregar) | Detalle del Inquilino, "Abrir Inventario de Colocación" | Inquilino + agente (2 firmas) | crea el contrato, propiedad → 'Arrendado' |
| **Devolución** (final al devolver) | Detalle del Contrato, "Inventario Final" | Inquilino + agente (2 firmas) | marca el contrato como terminado |

### El Inventario de Captación tiene 2 firmas pero NO del arrendatario
- Razón legal: la captación es entre el propietario y la agencia. El arrendatario aún no existe.
- Las firmas: propietario + agente.

### El Inventario de Colocación tiene 2 firmas del arrendatario + agente
- Razón legal: este es el documento que avala la entrega física del inmueble al inquilino. Es el cierre del contrato.
- La firma del propietario NO se requiere acá (ya firmó el Mandato y el Contrato de Arrendamiento).

### El Inventario de Devolución tiene 2 firmas del arrendatario + agente
- Razón legal: documenta el estado del inmueble cuando se devuelve al propietario.
- La firma del propietario se hace por separado (acta de entrega final).

## 3. Acceptance Criteria (numerados, binarios)

### AC-1: StepInventory soporta las 3 fases con un solo componente
- El componente `StepInventory` (en `src/features/properties/components/StepInventory.tsx`) tiene una prop `phase: 'inicial' | 'final'`.
- Renderiza distinto según la fase (firmantes, validaciones, copy).
- El `baseInventory` (para fase 'final') se pasa para diff contra el inicial.

### AC-2: Cada fase tiene su key en IndexedDB
- Captación: `id = ${propertyId}:inicial`
- Colocación: `id = ${tenantId}:final` o `${propertyId}:final` (depende del contexto)
- Devolución: `id = ${contractId}:final` o `${propertyId}:final` (nueva versión, snapshot al devolver)
- El `inventoryDB` (en `src/features/properties/inventoryDB.ts`) maneja las keys.

### AC-3: El inventario tiene áreas + items + fotos + firmas
- Estructura: `Inventory { areas: InventoryArea[], photos: InventoryPhoto[], signatures: Signature[], customAreas: InventoryArea[] }`.
- Cada `InventoryArea` tiene `items: Record<itemId, InventoryItem>` + fotos.
- Cada `InventoryItem` tiene `status: 'bueno' | 'regular' | 'malo' | 'na'` + `qty: number` + media.
- Las firmas son PNGs en base64 (`Signature { type: 'tenant' | 'agent' | 'owner', dataUrl: string }`).

### AC-4: El estado del item es binario para el agente
- 4 opciones: Bueno / Regular / Malo / N/A (default Bueno).
- Color visual por estado: verde / ámbar / rojo / gris.
- Click en el item abre un menú para cambiar el estado.

### AC-5: Las áreas se generan dinámicamente según el tipo de propiedad
- `PROPERTY_TYPES` en `inventoryConfig.ts` define las áreas fijas + multi-áreas con counters.
- Ejemplo: apartamento tiene 1 cocina + N habitaciones (counter) + 2 baños (counter).
- Custom areas (Otros) se agregan con un botón "Agregar área personalizada".

### AC-6: Las fotos se capturan con la cámara o se suben del filesystem
- Botón "Tomar foto" abre el input file con `accept="image/*"`.
- Las fotos se comprimen (max 1920px de ancho) y se guardan como dataURL base64 en IndexedDB.
- Se pueden agregar captions a cada foto.

### AC-7: Los videos cortos también se soportan (item media)
- Para items con daño, el agente puede grabar un video corto (<30s).
- El thumbnail (dataURL JPEG del primer frame) entra al PDF; el video completo se guarda en IndexedDB.
- En el PDF: thumbnail + ícono "▶ VIDEO" (jsPDF no embebe video).
- **Out of scope para este spec**: ver más detalles sobre el manejo de video.

### AC-8: Las firmas se capturan con un canvas o pad de firma
- El usuario firma con mouse / touch / stylus en un canvas.
- El resultado es un PNG base64 que se guarda en `Inventory.signatures[]`.
- Cada firma tiene `type: 'tenant' | 'agent' | 'owner'` y `signedAt: string`.

### AC-9: El botón "Firmar" está disabled hasta tener las firmas requeridas
- Para Captación: requiere 2 firmas (owner + agent).
- Para Colocación y Devolución: requiere 2 firmas (tenant + agent).
- Si falta alguna firma → toast "Faltan firmas para generar el PDF".

### AC-10: El PDF se genera y se sube a Drive automáticamente
- Click "Generar PDF firmado" → genera el PDF con `generateInventoryPdfBlob` (`src/features/properties/inventoryPdf.ts`).
- Sube el PDF a `Inventarios/` en Drive del propietario (o a otra subcarpeta según la fase).
- Toast: "✓ PDF del inventario firmado subido a Drive".
- El `pdfUrl` se persiste en `properties.inventory_captacion_pdf_url` (o similar según la fase).

### AC-11: Al firmar el Inventario de Colocación se crea el contrato
- Ver `wizard_tenant.md` AC-7.
- El handler `onComplete` del StepInventory:
  1. Crea el contrato en MySQL con `status='active'`.
  2. Flipea la propiedad a `status='Arrendado'`.
  3. Abre el `BillingSetupWizard` (ver `wizard_billing.md` AC-1).

### AC-12: El Inventario de Captación NO crea contrato
- La captación es ANTES de tener inquilino.
- El `onComplete` del StepInventory en fase 'inicial':
  1. Sube el PDF a Drive (en `Inventarios/`).
  2. NO crea contrato.
  3. NO flipea status de propiedad.
  4. Cierra el wizard y vuelve a la lista de propiedades.

### AC-13: El Inventario de Devolución marca el contrato como terminado
- El `onComplete` del StepInventory en fase 'final' (devolución):
  1. Sube el PDF a Drive.
  2. Marca el contrato como `status='terminated'`.
  3. Flipea la propiedad a `status='Inactivo'`.
  4. Toast: "✓ Inventario final subido. Contrato terminado."

### AC-14: Top-level try/catch + JSON errors
- Cualquier error no manejado devuelve JSON con `{ error: "..." }` y status 500.
- NUNCA devuelve HTML.

### AC-15: Drive operations tienen timeout 8s server-side
- Misma tabla de timeouts que `wizard_property.md` AC-5.

### AC-16: Cliente tiene timeout 15s via AbortController
- Mismo patrón que los otros wizards.

### AC-17: El botón "Generar PDF" se deshabilita durante la subida
- Spinner + "Generando…" durante la subida a Drive.
- Doble click prevention.

### AC-18: El inventario se persiste en MySQL con un POST al server
- `POST /api/inventories` con `id, propertyId, phase, propertyType, counters, areas, photos, signatures, customAreas`.
- El server hace UPSERT en la tabla `inventories` (constraint UNIQUE en `(property_id, phase)`).
- Devuelve la fila de MySQL con `signed_at` si tenía firmas.

### AC-19: Si el inventario YA existe para esa fase, el POST es idempotente (UPSERT)
- El server hace INSERT ... ON DUPLICATE KEY UPDATE.
- El user puede re-generar el PDF sin duplicar filas.

### AC-20: El PDF NO se persiste en MySQL (solo el URL)
- El PDF se guarda en Drive.
- Solo el `pdfUrl` (URL del webViewLink de Drive) se persiste en `properties.inventory_captacion_pdf_url` (o similar).
- Razón: el PDF puede pesar 5-10MB. MySQL guardaría un TEXT gigante.

## 4. Edge Cases

### EC-1: El user abre el Inventario de Colocación sin tener el Inventario de Captación
- El `baseInventory` es null.
- El wizard funciona igual: items en blanco para llenar.

### EC-2: El user quiere DIF entre el inventario inicial y el final
- Hay un componente `InventoryDiffView` (en `src/features/properties/InventoryDiffView.tsx`).
- Se muestra cuando `baseInventory` está presente y la fase es 'final'.
- Compara item por item y marca las diferencias (color rojo = dañado, ámbar = nuevo, verde = OK).

### EC-3: El user toma 50 fotos y el IndexedDB se llena
- Las fotos se comprimen (max 1920px ancho, JPEG quality 0.7).
- IndexedDB tiene cuota de ~50MB-1GB según el browser.
- Si se excede, el `inventoryDB.saveInventory` tira un error. Toast claro: "El inventario es demasiado grande. Reducí las fotos y reintentá."

### EC-4: El user graba un video de 5 minutos
- El `videoDataUrl` puede pesar 50-200MB.
- El IndexedDB tira error. Toast: "Video demasiado grande. Videos máximo 30s."
- **Validación previa**: rechazar videos > 30s en el cliente.

### EC-5: El servidor devuelve 409 (otra persona editó el mismo inventario)
- El POST a `/api/inventories` hace UPSERT, no INSERT, así que el 409 no debería pasar.
- PERO si pasa, toast "Otra persona modificó este inventario. Recargá la página."

### EC-6: El server está caído durante la subida del PDF
- El `onComplete` captura el error.
- Toast: "Inventario firmado, pero no se pudo subir el PDF a Drive. Reintentá."
- La firma SÍ se guarda localmente (IndexedDB). El user puede reintentar la subida.

### EC-7: El Inventario de Captación se hace DESPUÉS de tener un inquilino
- Caso edge: la propiedad se creó sin captación, se asignó un inquilino, y ahora se quiere hacer el inventario inicial.
- El wizard permite hacer la captación en cualquier momento. Solo afecta a la propiedad.
- PERO: la firma del propietario en la captación requiere que el propietario esté vivo y acepte firmar. Si no, el agente puede usar el flujo "captación sin firmas" (todavía no implementado, fuera de scope).

### EC-8: El user abre el Inventario de Devolución de un contrato que ya está terminado
- El form se inicializa con el estado del contrato.
- Si el contrato está `terminated` y ya tiene inventario final, muestra el diff histórico.
- **No permite** regenerar el inventario final (read-only).

### EC-9: La cámara no está disponible (no es mobile, no hay webcam)
- El input file con `accept="image/*"` permite seleccionar del filesystem.
- En desktop, el botón "Tomar foto" abre el file picker normal.

### EC-10: El agente quiere editar un inventario ya firmado
- El inventario es INMUTABLE una vez firmado (regla legal).
- Para corregir errores, se debe generar un inventario ADENDUM (fuera de scope).
- **Workaround**: el agente puede re-firmar con las firmas existentes. El server hace UPSERT.

## 5. Technical Contract

### Endpoint: POST /api/inventories

```typescript
// Request
interface CreateInventoryRequest {
  id: string;                  // ${propertyId}:inicial o ${propertyId}:final
  propertyId: string;
  phase: 'inicial' | 'final';
  propertyType: PropertyType;
  counters: { [counterKey: string]: number };
  areas: InventoryArea[];
  photos: InventoryPhoto[];      // dataURLs
  signatures: Signature[];
  customAreas: InventoryArea[];
  contractId?: string;           // solo para 'final' (colocación o devolución)
}

// Response 200: { inventory: <row de MySQL> }
```

### Endpoint: POST /api/inventories/upload-pdf

```typescript
// Request: { propertyId, phase, base64Data, inventoryDate }
// Response 200: { fileId, webViewLink, message }
// Response 400: { error: 'Faltan campos' }
```

### Endpoint: POST /api/inventories/upload-photos

```typescript
// Request: { propertyId, phase, photos: Array<{ areaSlug, fileName, base64Data }> }
// Response 200: { uploaded: Array<{ fileId, webViewLink, fileName }> }
```

### Componentes del cliente (props relevantes)

```typescript
interface StepInventoryProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  propertyId: string;
  property: { address: string; owner: string; ownerIdNumber: string; ... };
  tenant?: { id: string; name: string; idNumber: string; phone: string };
  tenantDriveFolderId?: string | null;
  /** Modo del wizard: inicial (captación) o final (colocación/devolución) */
  propertyType: PropertyType;
  phase: 'inicial' | 'final';
  hideSignatures?: boolean;        // Para vista histórica
  baseInventory?: Inventory | null; // Para diff en 'final'
  onBack: () => void;
  onComplete: (inventory: Inventory) => void | Promise<void>;
}

interface Inventory {
  id: string;                       // ${propertyId}:inicial o ${propertyId}:final
  propertyId: string;
  phase: 'inicial' | 'final';
  propertyType: PropertyType;
  counters: Record<string, number>;
  areas: InventoryArea[];
  photos: InventoryPhoto[];
  signatures: Signature[];
  customAreas: InventoryArea[];
  createdAt: string;
  updatedAt: string;
}
```

## 6. Timeouts (explícitos)

| Capa | Operación | Timeout |
|------|-----------|---------|
| Server | `oauth2Client.refreshAccessToken()` | 8s |
| Server | `drive.files.list` | 8s |
| Server | `drive.files.create` | 8s |
| Server | `pool.query()` (MySQL) | sin timeout |
| Cliente | `fetch('/api/inventories')` | 15s via AbortController |
| Cliente | `fetch('/api/inventories/upload-pdf')` | 30s (PDF grande) |
| Cliente | `fetch('/api/inventories/upload-photos')` | 60s (varias fotos) |
| IndexedDB | `inventoryDB.saveInventory` | 5s via Promise.race |

## 7. Tostadas exactas (copy approved — NO improvisar)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| AC-10 PDF subido | success | `✓ PDF del inventario firmado subido a Drive` |
| AC-11 contrato creado | success | `Inventario de colocación firmado — contrato creado, propiedad ahora Arrendada` |
| AC-12 captación OK | success | `✓ Inventario de captación subido a Drive` |
| AC-13 devolución OK | success | `✓ Inventario final subido. Contrato terminado.` |
| AC-13 contrato terminado | success | `Contrato terminado por devolución del inmueble` |
| AC-10 error upload | error | `Error al subir el PDF: ${error del server}` |
| AC-9 faltan firmas | error | `Faltan firmas para generar el PDF` |
| AC-18 server error | error | `Error al guardar el inventario: ${error del server}` |
| EC-3 IndexedDB lleno | error | `El inventario es demasiado grande. Reducí las fotos y reintentá.` |
| EC-4 video muy grande | error | `Video demasiado grande. Videos máximo 30 segundos.` |
| EC-6 server caído | error | `Inventario firmado, pero no se pudo subir el PDF a Drive. Reintentá.` |

## 8. Dependencias

### Archivos a modificar (potencialmente)
- `src/features/properties/components/StepInventory.tsx` (componente principal)
- `src/features/properties/inventoryPdf.ts` (generación del PDF)
- `src/features/properties/inventoryDB.ts` (IndexedDB)
- `src/features/properties/InventoryDiffView.tsx` (diff entre inicial y final)
- `src/features/tenants/TenantsView.tsx` (integración con Inventario de Colocación)
- `src/features/properties/PropertiesView.tsx` (integración con Inventario de Captación)
- `server/routes/inventories.ts` (POST /api/inventories, upload-pdf, upload-photos)

### Archivos a NO tocar (out of scope)
- `db/mysql/schema-hostinger.sql` (el schema ya tiene la tabla `inventories` con constraint UNIQUE en `(property_id, phase)`).
- `src/features/contracts/*` (los contratos se manejan en su propio wizard).
- `src/features/billing/*` (billing se configura después de la captación/colocación, no acá).

## 9. Out of Scope

- **Inventario Adendum** (para corregir errores en inventarios ya firmados).
- **Comparativa visual** (no solo el diff, sino una UI lado-a-lado de los 2 inventarios).
- **Firma digital con PKI** (solo firmas canvas/PNG por ahora).
- **OCR de las fotos** (no se extrae texto de las imágenes).
- **Firma desde mobile** (la captura funciona en mobile pero no está optimizada para UX mobile).
- **Multi-idioma** (todo en español de Colombia).

## 10. Riesgos identificados

- **Tamaño de IndexedDB**: las fotos en dataURL base64 pueden inflar el inventario. Mitigación: compresión JPEG quality 0.7 + límite de 1920px ancho.
- **Race condition entre signatures**: si el user firma 2 veces, la segunda firma pisa la primera. Mitigación: el sign canvas se resetea después de cada firma exitosa.
- **PDF tamaño**: un inventario con 50 fotos puede pesar 20-30MB. El upload a Drive puede tardar >15s. Mitigación: timeout 30s en el cliente, mejor compresión de fotos.
- **Pérdida de datos offline**: si el user llena el inventario sin conexión, las firmas se guardan en IndexedDB. Al reconectar, se sincroniza con MySQL. **No implementado**: el flujo offline-first está fuera de scope.
- **Firma del propietario en captación**: requiere que el propietario esté físicamente presente. Si no, el agente no puede generar el PDF firmado.

## 11. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]

---

## 12. Karpathy Amendment — photoGallery data shape fix (jul-2026)

### Contexto del bug
En producción (jul-2026) reportamos que abrir "Inicial" o "Final" desde
"Detalle del Inmueble → Inventarios" tira `TypeError: (st.photos ?? []).map
is not a function` y muestra el toast "Error cargando fotos del inventario".

### Causa raíz
Algunos inventarios guardados en IndexedDB o devueltos por MySQL tienen
`photos` como un **Record/Object** (`{id1: {...}, id2: {...}}`) en lugar
de un **Array** (`[{id, dataUrl, ...}, ...]`). El código asumía array y
usaba `.map()` / `for...of`. El operador `?? []` solo protege contra
null/undefined, no contra objetos.

La causa histórica más probable: una versión anterior del wizard guardaba
fotos como diccionario indexado por id. MySQL heredó esa forma via
`JSON.stringify(...)` y mysql2 la devolvió como objeto cuando auto-parseó
la columna JSON.

### AC-21: photoGallery no crashea con data legacy
- Al abrir "Inicial" o "Final" desde Detalle del Inmueble, la galería
  carga fotos sin error aunque `inventory.photos` llegue como Record/Object.
- Si la data es del tipo Record, se muestra un mensaje honesto en consola
  (`[gallery] inventory.photos era Record/Object — normalizado a array
  vacío. Self-heal save.`) y se re-guarda en IndexedDB con la forma
  correcta (array vacío si la data estaba corrupta irreparablemente).
- Si la data es array, no hay cambios visibles (no se hace console.warn).

### AC-22: StepInventory self-heals on load
- Cuando `StepInventory` carga un `existing` desde IndexedDB o MySQL,
  normaliza `photos` a array via `normalizePhotosArray(input)`.
- Si la forma era Record/Object, re-save en IndexedDB con la forma
  correcta (array vacío si no se puede reconstruir).
- La forma canónica se mantiene en memoria (`setInventory(existing)`)
  hasta el próximo `persist()`.

### AC-23: MySQL migration corre limpio
- Existe `scripts/fix-inventory-photos-object-to-array.sql` con:
  1. STEP 1 — Inspect: cuenta cuántas filas tienen `JSON_TYPE(photos) = 'OBJECT'`.
  2. STEP 2 — Migrate: UPDATE que convierte Object → Array via
     `JSON_TABLE(JSON_KEYS(...))` + `JSON_ARRAYAGG(JSON_EXTRACT(...))`.
     Solo afecta filas con `JSON_TYPE = 'OBJECT'`.
  3. STEP 3 — Verify: re-corre el count, espera `as_object = 0`.
- La migración es idempotente (segura de correr múltiples veces).
- Se aplica via phpMyAdmin o terminal Hostinger con
  `node scripts/apply-010-inventory-photos-array.mjs` (a crear si no existe).

### AC-24: helper `normalizePhotosArray` exportado
- Vive en `src/features/properties/inventoryDB.ts`.
- Acepta `unknown` (defensivo).
- Devuelve `any[]` SIEMPRE.
- Maneja:
  - `Array` → `filter(Boolean)` (descarta nulls).
  - `Object` (no array) → `Object.values()`. Si los valores son todos
    boolean/null (forma `{id1: true, id2: true}`), devuelve `[]`.
  - `null | undefined` → `[]`.
  - Otros tipos (string, number) → `[]`.
- Es IDÉMPOTENTE: aplicar 2 veces seguidas da el mismo resultado.

### Edge cases

#### EC-11: legacy IndexedDB data con `{id: {id, dataUrl, ...}}`
- El helper extrae los values correctamente → `[{id, dataUrl, ...}]`.
- Las fotos se muestran en la galería.

#### EC-12: legacy IndexedDB data con `{id1: true, id2: true}` (id set)
- El helper detecta que no es metadata y devuelve `[]`.
- La galería muestra "No hay fotos guardadas para este inventario".
- Toast: "No hay fotos guardadas para este inventario. Las fotos se
  guardan en el navegador (IndexedDB). Si limpiaste la caché del navegador,
  podés volver a tomarlas desde el botón Inicial/Final."

#### EC-13: MySQL data con `photos: 'null'` (string null)
- mysql2 auto-parsea a `null`. El helper devuelve `[]`. Sin error.

#### EC-14: MySQL data con `photos: NULL` (DB null)
- El helper devuelve `[]`. La galería muestra estado vacío.

### Out of Scope (este amendment)
- **Re-construir fotos desde Drive** si IndexedDB/MySQL están corruptos
  y no se puede inferir la metadata. (Posible feature: escanear la
  carpeta `Inventario captacion/` del Drive y re-llenar).
- **Validación de tipos de las fotos** (dataUrl base64, etc.).
- **Re-nombrar las fotos en Drive** si el fileName no sigue la
  convención.

