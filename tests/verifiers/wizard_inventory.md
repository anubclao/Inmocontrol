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

| Check | Status | Notas |
|-------|--------|-------|
| PRE-1 | ⏳ | health check |
| AC-1 | ⏳ | 3 fases |
| AC-2 | ⏳ | IndexedDB keys |
| AC-3 | ⏳ | estructura Inventory |
| AC-4 | ⏳ | estado binario item |
| AC-5 | ⏳ | áreas dinámicas |
| AC-6 | ⏳ | fotos |
| AC-7 | ⏳ | videos cortos |
| AC-8 | ⏳ | firmas canvas |
| AC-9 | ⏳ | botón disabled |
| AC-10 | ⏳ | PDF a Drive |
| AC-11 | ⏳ | Colocación crea contrato |
| AC-12 | ⏳ | Captación NO crea contrato |
| AC-13 | ⏳ | Devolución termina contrato |
| AC-14 | ⏳ | try/catch + JSON |
| AC-15 | ⏳ | server timeout 8s |
| AC-16 | ⏳ | client timeout 15s |
| AC-17 | ⏳ | botón disabled |
| AC-18 | ⏳ | persistencia MySQL |
| AC-19 | ⏳ | UPSERT idempotente |
| AC-20 | ⏳ | PDF solo URL |
| EC-1 | ⏳ | sin captación |
| EC-2 | ⏳ | diff captación/colocación |
| EC-3 | ⏳ | 50 fotos |
| EC-4 | ⏳ | video >30s |
| EC-5 | ⏳ | 409 |
| EC-6 | ⏳ | server caído |
| EC-7 | ⏳ | captación con tenant |
| EC-8 | ⏳ | editar firmado |
| EC-9 | ⏳ | cámara desktop |
| EC-10 | ⏳ | adendum |

**Veredicto final:**
- ✅ ALL PASS → listo para commit + push
- ❌ N FAIL → volver a Fase 4 (implementación)

## Historial de ejecuciones

| Fecha | Commit deployado | Pass / Total | Notas |
|-------|------------------|--------------|-------|
| 2026-07-23 | baseline | 0/30 | primera ejecución — esperamos ver varios FAILs |
