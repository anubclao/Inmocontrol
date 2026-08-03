# Verifier: Wizard de Inventario (Captación + Colocación + Final)

> **Karpathy Verifier** — Julio 2026. Cada Acceptance Criterion de
> `docs/specs/wizard_inventory.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un
> check falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io` (DB `u652436213_inmocontrol`)
- Browser con DevTools (F12) en incógnito
- Para algunas pruebas: una propiedad de prueba con `status='Activo'`
  y un tenant activo asignado.

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere
- ⚠️ **SKIP** — no verificable ahora (motivo)

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

### AC-1: StepInventory soporta las 3 fases

**Pasos:**

1. Hard refresh (Ctrl+Shift+R).
2. Abrir el Inventario de Captación desde una propiedad.
3. **Verificar**: el wizard muestra "Inventario de Captación" (fase inicial).
4. Cerrar. Abrir el Inventario de Colocación desde un tenant.
5. **Verificar**: el wizard muestra "Inventario de Colocación" (fase final).
6. **Verificar**: copy distinto entre las 2 fases (firmantes diferentes).

**Status:** ⏳ Pending

---

### AC-2: Cada fase tiene su key en IndexedDB

**Pasos:**

1. DevTools → Application → IndexedDB → inventoryDB.
2. Crear un Inventario de Captación de prueba.
3. **Verificar**: existe la key `${propertyId}:inicial`.
4. Crear un Inventario de Colocación de prueba.
5. **Verificar**: existe la key `${propertyId}:final` o `${tenantId}:final` (verificar cuál usa el código).

**Status:** ⏳ Pending

---

### AC-3: El inventario tiene áreas + items + fotos + firmas

**Pasos:**

1. Abrir el StepInventory.
2. **Verificar**: la estructura tiene:
   - `areas: Array<InventoryArea>` con `items: Record<itemId, InventoryItem>`.
   - `photos: Array<InventoryPhoto>` con `dataUrl, areaId, caption, takenAt`.
   - `signatures: Array<Signature>` con `type: 'tenant' | 'agent' | 'owner'`, `dataUrl`, `signedAt`.

**Status:** ⏳ Pending

---

### AC-4: El estado del item es binario

**Pasos:**

1. Abrir un item de un área.
2. **Verificar**: 4 opciones: Bueno / Regular / Malo / N/A.
3. Click en cada opción.
4. **Verificar**: el color del badge cambia: verde / ámbar / rojo / gris.

**Status:** ⏳ Pending

---

### AC-5: Las áreas se generan dinámicamente

**Pasos:**

1. Para un apartamento: 1 cocina + N habitaciones (counter) + 2 baños.
2. **Verificar**: la lista de áreas se genera según `PROPERTY_TYPES['apartamento']`.
3. Para un local comercial: áreas diferentes.
4. **Verificar**: el tipo de propiedad afecta la lista.
5. Click "Agregar área personalizada".
6. **Verificar**: se agrega un área custom con label editable.

**Status:** ⏳ Pending

---

### AC-6: Las fotos se capturan con la cámara o se suben

**Pasos:**

1. Click "Tomar foto" en un item.
2. **Verificar**: se abre el file picker con `accept="image/*"`.
3. Elegir una foto JPG.
4. **Verificar**: la foto se agrega al item con caption opcional.

**Status:** ⏳ Pending

---

### AC-7: Los videos cortos también se soportan

**Pasos:**

1. Click "Grabar video" en un item dañado.
2. **Verificar**: el input permite video.
3. Grabar un video de 10s.
4. **Verificar**: se guarda en IndexedDB con `type='video'`.
5. El PDF muestra el thumbnail (dataURL) + ícono "▶ VIDEO" en vez del video completo.

**Status:** ⏳ Pending

---

### AC-8: Las firmas se capturan con un canvas

**Pasos:**

1. Abrir el pad de firma (sección "Firmas").
2. Dibujar una firma con mouse/touch.
3. Click "Guardar firma".
4. **Verificar**: la firma se guarda como PNG base64 en `signatures[]`.

**Status:** ⏳ Pending

---

### AC-9: El botón "Firmar" está disabled hasta tener las firmas requeridas

**Pasos (Captación):**

1. Inventario de Captación: llenar 1 área con 1 item.
2. **Verificar**: botón "Firmar" disabled.
3. Firmar como owner. **Verificar**: SIGUE disabled.
4. Firmar como agent. **Verificar**: se habilita.

**Pasos (Colocación/Devolución):**

1. Misma lógica con 2 firmas (tenant + agent).

**Status:** ⏳ Pending

---

### AC-10: El PDF se genera y se sube a Drive

**Pasos:**

1. Captación: llenar + firmar (owner + agent) → click "Firmar".
2. **Verificar**: toast "✓ PDF del inventario firmado subido a Drive".
3. **Verificar**: el PDF se descarga localmente.
4. **Verificar**: en Google Drive, en la carpeta de la propiedad → Inventarios/ → hay 1 PDF.

```powershell
# Verificar en phpMyAdmin:
SELECT inventory_captacion_pdf_url FROM properties WHERE id = 'X';
# Esperado: https://drive.google.com/...
```

**Status:** ⏳ Pending

---

### AC-11: Al firmar el Inventario de Colocación se crea el contrato

**Pasos:**

1. Tenant en "En Colocación" (sin contrato activo).
2. Inventario de Colocación: llenar + firmar (tenant + agent).
3. Click "Firmar".
4. **Verificar**: toast "Inventario de colocación firmado — contrato creado, propiedad ahora Arrendada".

```powershell
SELECT id, status FROM contracts WHERE tenant_id = 'X';
# Esperado: status='active'.

SELECT id, status FROM properties WHERE id = 'Y';
# Esperado: status='Arrendado'.
```

**Status:** ⏳ Pending

---

### AC-12: El Inventario de Captación NO crea contrato

**Pasos:**

1. Propiedad en "Activo" sin inventario de captación.
2. Captación: llenar + firmar (owner + agent).
3. Click "Firmar".
4. **Verificar**: NO se crea un nuevo contrato.

```powershell
SELECT COUNT(*) FROM contracts WHERE property_id = 'X';
# Esperado: el mismo número que antes (0 o 1).
```

**Status:** ⏳ Pending

---

### AC-13: El Inventario de Devolución marca el contrato como terminado

**Pasos:**

1. Contrato activo. Inventario de Devolución: llenar + firmar.
2. Click "Firmar".
3. **Verificar**: toast "✓ Inventario final subido. Contrato terminado."

```powershell
SELECT status FROM contracts WHERE id = 'Z';
# Esperado: 'terminated'.

SELECT status FROM properties WHERE id = 'Y';
# Esperado: 'Inactivo'.
```

**Status:** ⏳ Pending

---

### AC-14: Top-level try/catch + JSON errors

```powershell
$body = '{"id":"X","propertyId":"Y","phase":"inicial","propertyType":"apartamento","counters":{},"areas":[],"photos":[],"signatures":[],"customAreas":[]}'
$res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/inventories" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
Write-Host $res.Content
```

**Esperado**: 400 JSON. NO HTML.

**Status:** ⏳ Pending

---

### AC-15: Drive operations timeout 8s server-side

**Pasos:**

1. DevTools → Network → Block `*googleapis.com*`.
2. Hacer un Inventario de Captación con fotos.
3. Click "Firmar".
4. **Esperado**: server responde en <10s (no se cuelga).

**Status:** ⏳ Pending

---

### AC-16: Cliente timeout 15s via AbortController

**Pasos:**

1. DevTools → Throttling → Slow 3G.
2. Firmar un Inventario.
3. **Esperado**: si el server tarda >15s → toast "El servidor tardó demasiado".

**Status:** ⏳ Pending

---

### AC-17: El botón "Generar PDF" se deshabilita durante la subida

**Pasos:**

1. Inventario listo para firmar.
2. DevTools → Throttling → Slow 3G.
3. Click "Firmar".
4. **Verificar**: el botón muestra spinner + "Generando…" y está disabled.

**Status:** ⏳ Pending

---

### AC-18: El inventario se persiste en MySQL

```powershell
# Después de firmar un inventario, verificar en phpMyAdmin:
SELECT id, property_id, phase, property_type, signed_at
FROM inventories
WHERE property_id = 'X' AND phase = 'inicial';
# Esperado: 1 fila con signed_at NOT NULL.
```

**Status:** ⏳ Pending

---

### AC-19: El POST es idempotente (UPSERT)

**Pasos:**

1. Firmar un Inventario de Captación.
2. Re-firmar el mismo (por error del agente).
3. **Verificar**: NO se crea una fila duplicada. La misma fila se actualiza con la nueva fecha.

```powershell
SELECT COUNT(*) FROM inventories WHERE property_id = 'X' AND phase = 'inicial';
# Esperado: 1 fila (no 2).
```

**Status:** ⏳ Pending

---

### AC-20: El PDF NO se persiste en MySQL (solo el URL)

```powershell
# El PDF está en Drive, no en MySQL.
# El URL sí está en properties.inventory_captacion_pdf_url (o similar).
SELECT inventory_captacion_pdf_url FROM properties WHERE id = 'X';
# Esperado: URL de Drive.
```

**Status:** ⏳ Pending

---

### AC-21: photoGallery no crashea con data legacy (Record/Object)

**Pasos:**

1. Preparar data legacy en IndexedDB: simular una fila con `photos` como `Record/Object` (no array). Se puede hacer con DevTools → Application → IndexedDB → `inventoryDB` → editar el registro y setear `photos = {abc: {id:'abc', dataUrl:'...', areaId:'a', caption:'x', takenAt:'...'}}`.
2. Hard refresh (Ctrl+Shift+R).
3. Detalle del Inmueble → Inventarios → click "Inicial" o "Final".
4. **Verificar**: la galería abre sin error en consola.
5. **Verificar** (consola): aparece el log honesto `[gallery] inventory.photos era Record/Object — normalizado a array vacío. Self-heal save.`
6. **Verificar**: la fila de IndexedDB se re-guarda con la forma canónica (array). Inspeccionar en DevTools → IndexedDB.

**Status:** ⏳ Pending

---

### AC-22: StepInventory self-heals on load

**Pasos:**

1. Caso A (IndexedDB): con la misma data legacy del AC-21, recargar el wizard.
2. **Verificar**: el helper `normalizePhotosArray(input)` se ejecuta al cargar.
3. **Verificar**: en memoria queda la forma array (vacía si no se pudo reconstruir).
4. Caso B (MySQL): en phpMyAdmin, ejecutar `UPDATE inventories SET photos = '{"k1":true,"k2":true}' WHERE id = 'X';` (forma id set).
5. Recargar la página, abrir el inventario.
6. **Verificar**: la galería abre, muestra "No hay fotos guardadas para este inventario", sin error.
7. **Verificar**: en memoria la forma queda como array `[]` (no Record).

**Status:** ⏳ Pending

---

### AC-23: MySQL migration corre limpio

**Pasos:**

1. En phpMyAdmin, ejecutar:

```sql
-- STEP 1: Inspect
SELECT COUNT(*) AS as_object
FROM inventories
WHERE JSON_TYPE(photos) = 'OBJECT';
```

2. **Verificar**: el count es ≥ 0 (puede ser 0 si ya se migró).
3. Ejecutar el script de migración: `node scripts/apply-010-inventory-photos-array.mjs` (o abrir `scripts/fix-inventory-photos-object-to-array.sql` en phpMyAdmin y correr el STEP 2 manualmente).
4. **Verificar**: el script responde sin error.
5. STEP 3: re-correr el count del paso 1.
6. **Verificar**: el count ahora es `0` (todas las filas migradas).
7. Re-correr el script completo (migración idempotente).
8. **Verificar**: no rompe nada, count sigue en `0`.

**Status:** ⏳ Pending

---

### AC-24: helper `normalizePhotosArray` exportado y testeado

**Pasos:**

1. En DevTools → Sources, buscar `src/features/properties/inventoryDB.ts`.
2. **Verificar**: el helper está exportado (`export function normalizePhotosArray(...)`).
3. Probar las 5 ramas en consola (con import dinámico desde la app abierta):
   - `normalizePhotosArray([{a:1}, null, {b:2}])` → `[{a:1}, {b:2}]` (filter Boolean).
   - `normalizePhotosArray({id1: {id:'id1', dataUrl:'x'}, id2: {id:'id2', dataUrl:'y'}})` → `[{id:'id1', dataUrl:'x'}, {id:'id2', dataUrl:'y'}]` (Object values).
   - `normalizePhotosArray({id1: true, id2: true})` → `[]` (id set).
   - `normalizePhotosArray(null)` → `[]`.
   - `normalizePhotosArray(undefined)` → `[]`.
4. **Verificar**: aplicar 2 veces seguidas da el mismo resultado (idempotente).
5. **Verificar**: el helper acepta `unknown` y nunca lanza excepción (defensivo).

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Inventario de Colocación sin Captación previa

**Pasos:**

1. Tenant asignado a una propiedad SIN inventario de captación.
2. Abrir el Inventario de Colocación.
3. **Verificar**: el `baseInventory` es null.
4. El wizard funciona normalmente (items en blanco para llenar).

**Status:** ⏳ Pending

---

### EC-2: Diff entre Captación y Colocación

**Pasos:**

1. Propiedad con Captación firmada.
2. Tenant con Colocación pendiente.
3. Abrir el Inventario de Colocación.
4. **Verificar**: aparece la sección "Comparar con Captación" (`InventoryDiffView`).
5. **Verificar**: los items iguales aparecen en verde, los nuevos en ámbar, los dañados en rojo.

**Status:** ⏳ Pending

---

### EC-3: 50 fotos → IndexedDB se llena

**Pasos:**

1. Subir 50 fotos a un inventario.
2. **Esperado**: error claro "El inventario es demasiado grande. Reducí las fotos y reintentá."
3. NO se pierde el trabajo hecho (las fotos se quedan en IndexedDB, solo falla el save).

**Status:** ⏳ Pending

---

### EC-4: Video >30s

**Pasos:**

1. Grabar un video de 1 minuto.
2. **Esperado**: rechazo del cliente con "Video demasiado grande. Videos máximo 30 segundos."

**Status:** ⏳ Pending

---

### EC-5: Server devuelve 409 (edición concurrente)

**Pasos:**

1. (Setup manual) Forzar 409 enviando un POST con el mismo id 2 veces en rápida sucesión.
2. **Verificar**: el server devuelve 409 con JSON.

**Status:** ⏳ Pending

---

### EC-6: Server caído durante la subida del PDF

**Pasos:**

1. DevTools → Network → Offline.
2. Firmar un Inventario.
3. **Verificar**: las firmas SÍ se guardan localmente (IndexedDB).
4. Toast: "Inventario firmado, pero no se pudo subir el PDF a Drive. Reintentá."

**Status:** ⏳ Pending

---

### EC-7: Captación después de tener un inquilino

**Pasos:**

1. Propiedad con tenant activo.
2. Crear el Inventario de Captación (fase inicial) AHORA.
3. **Verificar**: el wizard funciona normalmente.

**Status:** ⏳ Pending

---

### EC-8: Editar inventario ya firmado

**Pasos:**

1. Inventario de Captación firmado (ya tiene `signed_at`).
2. Re-abrir el wizard.
3. **Verificar**: el wizard permite re-firmar (reemplaza la firma anterior).
4. PERO NO permite editar items (son inmutables una vez firmados).
5. **Decisión a tomar**: ¿el wizard actual permite editar items firmados? Si sí, ese es un bug.

**Status:** ⏳ Pending

---

### EC-9: Cámara no disponible en desktop

**Pasos:**

1. Desktop sin webcam. Click "Tomar foto".
2. **Verificar**: se abre el file picker normal del SO (no la cámara).

**Status:** ⏳ Pending

---

### EC-10: Editar inventario con adendum

**Pasos:**

1. (Out of scope) — el spec dice que los adendums están fuera de scope.
2. **Verificar**: el wizard actual NO tiene UI de adendum.

**Status:** ⏳ Pending

---

## Resumen de ejecución

| Check | Status | Notas                       |
| ----- | ------ | --------------------------- |
| PRE-1 | ⏳     | health check                |
| AC-1  | ⏳     | 3 fases                     |
| AC-2  | ⏳     | IndexedDB keys              |
| AC-3  | ⏳     | estructura Inventory        |
| AC-4  | ⏳     | estado binario item         |
| AC-5  | ⏳     | áreas dinámicas             |
| AC-6  | ⏳     | fotos                       |
| AC-7  | ⏳     | videos cortos               |
| AC-8  | ⏳     | firmas canvas               |
| AC-9  | ⏳     | botón disabled              |
| AC-10 | ⏳     | PDF a Drive                 |
| AC-11 | ⏳     | Colocación crea contrato    |
| AC-12 | ⏳     | Captación NO crea contrato  |
| AC-13 | ⏳     | Devolución termina contrato |
| AC-14 | ⏳     | try/catch + JSON            |
| AC-15 | ⏳     | server timeout 8s           |
| AC-16 | ⏳     | client timeout 15s          |
| AC-17 | ⏳     | botón disabled              |
| AC-18 | ⏳     | persistencia MySQL          |
| AC-19 | ⏳     | UPSERT idempotente          |
| AC-20 | ⏳     | PDF solo URL                |
| EC-1  | ⏳     | sin captación               |
| EC-2  | ⏳     | diff captación/colocación   |
| EC-3  | ⏳     | 50 fotos                    |
| EC-4  | ⏳     | video >30s                  |
| EC-5  | ⏳     | 409                         |
| EC-6  | ⏳     | server caído                |
| EC-7  | ⏳     | captación con tenant        |
| EC-8  | ⏳     | editar firmado              |
| EC-9  | ⏳     | cámara desktop              |
| EC-10 | ⏳     | adendum                     |

**Veredicto final:**

- ✅ ALL PASS → listo para commit + push
- ❌ N FAIL → volver a Fase 4 (implementación)

## Historial de ejecuciones

| Fecha      | Commit deployado | Pass / Total | Notas                                          |
| ---------- | ---------------- | ------------ | ---------------------------------------------- |
| 2026-07-23 | baseline         | 0/30         | primera ejecución — esperamos ver varios FAILs |

---

## Karpathy Amendment — photoGallery data shape (jul-2026)

> Checks para los nuevos AC-21/22/23/24 del spec.

### AC-21.A: openPhotoGallery no crashea con photos como Record

**Setup (manual, en DevTools Console):**

```js
// 1. Hard refresh
// 2. Abrir Detalle del Inmueble → Inventarios → click "Inicial"
// 3. Si IndexedDB tiene data legacy, simular inyectando un Record:
//    (esto es para validar el path de normalización)
```

**Pasos:**

1. Hard refresh (Ctrl+Shift+R).
2. Abrir DevTools (F12) → Application → IndexedDB → `inmocontrol-db` →
   `inventories` → buscar el row de la propiedad KR 12 142 74 AP 303.
3. Editar la fila manualmente: cambiar `photos: [...]` a
   `photos: {"legacy-id-1": {"id": "legacy-id-1", "dataUrl": "data:image/png;base64,iVBOR...", "areaId": "single-0", "fileName": "test.png", "takenAt": "2026-07-23T10:00:00Z"}}`
   (un Record/Object en vez de Array).
4. Guardar. Refrescar la página.
5. Detalle del Inmueble → Inventarios → click "Inicial".
6. **Verificar**: la galería abre sin error. Muestra 0 fotos (porque el
   Record no tiene metadata completa) + el mensaje de "No hay fotos".
7. **Verificar en consola**: `[gallery] inventory.photos era Record/Object
— normalizado a array vacío. Self-heal save.`
8. **Verificar en IndexedDB**: la fila fue re-guardada con `photos: []`.

**Status:** ⏳ Pending

---

### AC-21.B: openPhotoGallery funciona con photos como Array normal

**Pasos:**

1. Hard refresh.
2. Detalle del Inmueble → Inventarios → click "Inicial".
3. **Verificar**: la galería abre y muestra las fotos que se subieron
   previamente (si hay). Sin error en consola.

**Status:** ⏳ Pending

---

### AC-22.A: StepInventory normaliza al cargar (IndexedDB legacy)

**Pasos:**

1. Mismo setup que AC-21.A: inyectar `photos` como Record en IndexedDB.
2. Detalle del Inmueble → click "Inicial" para ABRIR el wizard.
3. **Verificar en consola**: `[inventory] ${inventoryId}: photos era
Record/Object — normalizado a array vacío. Self-heal save.`
4. **Verificar**: el wizard abre, no se traba en la carga.
5. **Verificar**: si había fotos válidas, se ven en el wizard.

**Status:** ⏳ Pending

---

### AC-22.B: StepInventory normaliza al cargar (MySQL legacy)

**Pasos:**

1. En phpMyAdmin, ejecutar el inspect:

```sql
SELECT id, JSON_TYPE(photos) AS photos_type FROM inventories
WHERE property_id = (SELECT id FROM properties WHERE address LIKE '%KR 12 142 74 AP 303%')
ORDER BY created_at DESC;
```

2. Si alguna fila tiene `photos_type = 'OBJECT'`, dejarla así.
3. Detalle del Inmueble → click "Inicial" para abrir el wizard
   (que debería trigger el fallback MySQL porque IndexedDB no tiene
   la data o la borramos para esta prueba).
4. **Verificar en consola**: el inventario se carga desde MySQL,
   `photos` se normaliza, no hay error de `.map`.

**Status:** ⏳ Pending

---

### AC-23.A: MySQL STEP 1 — Inspect cuenta correctamente

**Pasos:**

1. En phpMyAdmin → SQL tab, correr el STEP 1 del script
   `scripts/fix-inventory-photos-object-to-array.sql`:

```sql
SELECT
  COUNT(*) AS total_inventories,
  SUM(CASE WHEN JSON_TYPE(photos) = 'ARRAY'  THEN 1 ELSE 0 END) AS as_array,
  SUM(CASE WHEN JSON_TYPE(photos) = 'OBJECT' THEN 1 ELSE 0 END) AS as_object,
  SUM(CASE WHEN JSON_TYPE(photos) IS NULL    THEN 1 ELSE 0 END) AS as_null
FROM inventories;
```

2. **Verificar**: el output muestra `total_inventories`, `as_array`,
   `as_object`, `as_null`.
3. **Anotar**: el valor de `as_object` antes de la migración.

**Status:** ⏳ Pending

---

### AC-23.B: MySQL STEP 2 — Migrate convierte OBJECT → ARRAY

**Pasos:**

1. Si `as_object > 0` en AC-23.A, descomentar el UPDATE del STEP 2.
2. Correr el UPDATE.
3. **Verificar**: no hay errores SQL. `affected rows` > 0 si había filas
   con OBJECT.

**Status:** ⏳ Pending

---

### AC-23.C: MySQL STEP 3 — Verify post-migración

**Pasos:**

1. Re-correr el SELECT de AC-23.A.
2. **Verificar**: `as_object = 0`. `as_array` ahora incluye las filas
   migradas (debería ser `as_array + as_object` del step 1).

**Status:** ⏳ Pending

---

### AC-23.D: MySQL data migra es idempotente

**Pasos:**

1. Re-correr el UPDATE de AC-23.B (debería ser no-op).
2. **Verificar**: `affected rows = 0`. Sin errores.

**Status:** ⏳ Pending

---

### AC-24.A: helper `normalizePhotosArray` maneja todos los casos

**Pasos:**

1. En DevTools Console, importar el helper y testear:

```js
const { normalizePhotosArray } =
  await import("/src/features/properties/inventoryDB.ts");
const tests = [
  { input: [], expected: [] },
  { input: [1, 2, 3], expected: [1, 2, 3] },
  { input: null, expected: [] },
  { input: undefined, expected: [] },
  { input: "foo", expected: [] },
  { input: 42, expected: [] },
  { input: { a: { x: 1 }, b: { y: 2 } }, expected: [{ x: 1 }, { y: 2 }] },
  { input: { a: true, b: false }, expected: [] },
  { input: { a: null, b: null }, expected: [] },
];
for (const t of tests) {
  const out = normalizePhotosArray(t.input);
  const ok = JSON.stringify(out) === JSON.stringify(t.expected);
  console.log(
    ok ? "✅" : "❌",
    JSON.stringify(t.input),
    "→",
    JSON.stringify(out),
  );
}
```

2. **Verificar**: todos los tests pasan (✅).

**Status:** ⏳ Pending

---

### EC-11: IndexedDB con `{id: {id, dataUrl, ...}}` (Record con metadata)

**Pasos:**

1. Mismo setup que AC-21.A pero el Record tiene metadata completa.
2. Detalle del Inmueble → Inventarios → click "Inicial".
3. **Verificar**: la galería muestra las fotos correctamente.
4. **Verificar**: el `areaLabel` se asigna via lookup en `inventory.areas`.

**Status:** ⏳ Pending

---

### EC-12: IndexedDB con `{id1: true, id2: true}` (id set)

**Pasos:**

1. Setup: inyectar `photos: {"id1": true, "id2": true}` en IndexedDB.
2. Detalle del Inmueble → Inventarios → click "Inicial".
3. **Verificar**: galería abre sin error. Muestra 0 fotos + el mensaje
   "No hay fotos guardadas para este inventario".
4. **Verificar en consola**: `[gallery] inventory.photos era Record/Object
— normalizado a array vacío. Self-heal save.`

**Status:** ⏳ Pending

---

### EC-13: MySQL `photos: 'null'` (string null)

**Pasos:**

1. En phpMyAdmin, UPDATE manual:

```sql
UPDATE inventories SET photos = 'null' WHERE id = '...';
```

2. Detalle del Inmueble → Inventarios → click "Inicial".
3. **Verificar**: galería abre, 0 fotos, sin error.

**Status:** ⏳ Pending

---

### EC-14: MySQL `photos: NULL` (DB null)

**Pasos:**

1. En phpMyAdmin, UPDATE manual:

```sql
UPDATE inventories SET photos = NULL WHERE id = '...';
```

2. Detalle del Inmueble → Inventarios → click "Inicial".
3. **Verificar**: galería abre, 0 fotos, sin error.

**Status:** ⏳ Pending

---

## Resumen de ejecución (amendment jul-2026)

| Check   | Status | Notas                                  |
| ------- | ------ | -------------------------------------- |
| AC-21.A | ⏳     | photoGallery no crashea con Record     |
| AC-21.B | ⏳     | photoGallery funciona con Array normal |
| AC-22.A | ⏳     | StepInventory normaliza (IndexedDB)    |
| AC-22.B | ⏳     | StepInventory normaliza (MySQL)        |
| AC-23.A | ⏳     | SQL inspect                            |
| AC-23.B | ⏳     | SQL migrate                            |
| AC-23.C | ⏳     | SQL verify post                        |
| AC-23.D | ⏳     | SQL idempotente                        |
| AC-24.A | ⏳     | helper unit tests                      |
| EC-11   | ⏳     | Record con metadata                    |
| EC-12   | ⏳     | Record id set                          |
| EC-13   | ⏳     | MySQL string null                      |
| EC-14   | ⏳     | MySQL DB null                          |
