# Verifier: Wizard de Propiedad — E2E Checklist

> **Karpathy Verifier** — Julio 2026. Cada Acceptance Criterion de
> `docs/specs/wizard_property.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un
> check falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (verificar `f9669ef` o más nuevo en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin: `https://auth-db1569.hstgr.io` (DB `u652436213_inmocontrol`)
- Browser con DevTools (F12 → Console) en incógnito para evitar cache
- PowerShell 7+ en Windows

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere (adjuntar output real)
- ⚠️ **SKIP** — no verificable ahora (motivo)

### Cómo correr los checks de DB

```powershell
# Limpiar cualquier fila de prueba previa
$dbCheck = @"
DELETE FROM properties WHERE address LIKE 'TEST-%';
"@
# Pegar en phpMyAdmin → SQL
```

---

## Pre-check (ejecutar ANTES de los AC)

### PRE-1: Health check

```powershell
$h = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/health" -UseBasicParsing -TimeoutSec 10
Write-Host "Status: $($h.StatusCode)"
Write-Host $h.Content
```

**Esperado:** `200 OK` con `{"status":"ok","db":{"ok":true,...}}`

**Status:** ⏳ Pending

---

## Acceptance Criteria

### AC-1: Click "Continuar a Documentación" persiste en MySQL

**Pasos:**
1. Hard refresh del browser (Ctrl+Shift+R).
2. Login + ir a Propiedades → "+ Agregar Primera Propiedad".
3. Llenar step 1: address="TEST-AC1", chip="AAATESTAC1", folio="50NTESTAC1",
   nombre="Test Owner AC1", cédula="12345678", phone="3001234567",
   email="test@ac1.com".
4. Click "Continuar a Documentación".
5. **Esperar máx 20s**. No cerrar nada.
6. Verificar toast: ¿dice "✓ Avance guardado en el servidor (MySQL)..."?
7. Verificar wizard: ¿avanzó a step 2?
8. En phpMyAdmin: `SELECT id, address, status, owner_name, owner_phone, owner_email FROM properties WHERE address = 'TEST-AC1';`
9. ¿Aparece la fila con status='Pendiente'?

**Resultado esperado:**
- Toast correcto, wizard en step 2
- Fila en DB con `status='Pendiente'`, `owner_phone='3001234567'`, `owner_email='test@ac1.com'`

**Status:** ⏳ Pending

---

### AC-2: "Guardar avance (este equipo)" también persiste

**Pasos:**
1. Wizard abierto en step 1 (recargar y abrir wizard fresco).
2. Llenar: address="TEST-AC2", chip="AAATESTAC2", folio="50NTESTAC2",
   owner="Test Owner AC2", phone="3009999999", email="test@ac2.com".
3. Click "💾 Guardar avance (este equipo)".
4. **Esperar máx 20s**.
5. Verificar toast: ¿dice "✓ Avance guardado en el servidor (MySQL). Estado: Pendiente hasta subir el Mandato."?
6. **NO debe decir "Avance guardado en este navegador"** (esa es la copia vieja, prohibida).
7. En phpMyAdmin: `SELECT * FROM properties WHERE address = 'TEST-AC2';` → debe aparecer la fila.

**Status:** ⏳ Pending

---

### AC-3: Phone y email se guardan en legacy columns de `properties`

**Pasos:**
1. Reutilizar la fila de AC-1 (TEST-AC1).
2. `SELECT owner_phone, owner_email FROM properties WHERE address = 'TEST-AC1';`
3. ¿Aparecen '3001234567' y 'test@ac1.com'?
4. (No deben ser NULL — esa era la symptom del bug de julio-2026.)

**Status:** ⏳ Pending

---

### AC-4: Timeout 15s en el cliente (simular server colgado)

**Pasos:**
1. DevTools (F12) → Network → Throttling → "Slow 3G" o similar.
2. Wizard abierto en step 1.
3. Llenar datos y click "Continuar a Documentación".
4. **Esperar 20s** (más del timeout de 15s).
5. ¿Aparece toast "El servidor tardó demasiado. Reintentá en unos segundos."?
6. ¿El botón "Continuar a Documentación" vuelve a estar habilitado (no disabled)?
7. Verificar en phpMyAdmin: ¿NO se creó la fila?

**Status:** ⏳ Pending

---

### AC-5: Server responde en <10s si Google Drive está caído

**Pasos:**
1. DevTools → Network → Block request URL → agregar `*googleapis.com*` y `*googleusercontent.com*`.
2. Wizard step 1, llenar y click "Continuar a Documentación".
3. **Esperar 12s** (Drive timeout 8s + margen).
4. Verificar toast: ¿el wizard avanzó a step 2?
5. En phpMyAdmin: ¿se creó la fila con `drive_folder_id IS NULL`?

**Resultado esperado:**
- Wizard avanzó, fila creada con `drive_folder_id=NULL`
- Drive loguea warning pero NO bloquea

**Status:** ⏳ Pending

---

### AC-6: Errores del server devuelven JSON (nunca HTML)

**Pasos:**
1. Forzar un error: por ejemplo, enviar un body sin `address` vía curl:
   ```powershell
   $body = '{"chip":"AAATEST","folio":"50NTEST","ownerName":"Test"}'  # sin address
   $res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/properties" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 30
   Write-Host "Status: $($res.StatusCode)"
   Write-Host $res.Content
   ```
2. ¿El status es 400?
3. ¿El body es JSON (empieza con `{`)? **NO debe empezar con `<html>`**.

**Status:** ⏳ Pending

---

### AC-7: Modal "Continuar a Inventario" con pendientes

**Pasos:**
1. Wizard → step 1 → click "Continuar a Documentación" (avanza a step 2).
2. En step 2, NO subir ningún documento. Click "Continuar a Inventario".
3. ¿Aparece modal con la lista de "Vas a finalizar con N pendiente(s)"?
4. ¿El modal tiene 2 botones: "Subir los pendientes" y "Sí, continuar con N pendiente(s)"?

**Status:** ⏳ Pending

---

### AC-8: Badge de storage en DocCard

**Pasos:**
1. Wizard step 2.
2. Mirar una card de documento SIN subir (ej: Cédula).
3. ¿El badge dice algo explícito? (Si no hay archivo, debería estar vacío o
   con texto "Click para subir PDF").
4. Subir 1 PDF a la card de Cédula.
5. **Si Drive está bien**: el badge debe ser 🟢 "En Drive" con icono CheckCircle2.
6. **Si Drive está caído (AC-5)**: el badge debe ser 🟠 "Pendiente → Drive" con icono CloudUpload.
7. ¿El texto debajo del título coincide con el estado real (no miente)?

**Status:** ⏳ Pending

---

### AC-9: Upload a Drive en tiempo real durante step 2

**Pasos:**
1. Wizard step 2 con Drive conectado.
2. Subir 1 PDF a cualquier card.
3. **Antes del finalize**: ¿el archivo ya está en Google Drive?
   - Verificar en Drive: `Mi unidad / InmoControl / TEST-AC1 / Propietario/`
4. ¿La card muestra 🟢 "En Drive" inmediatamente?

**Status:** ⏳ Pending

---

### AC-10: Modal "¿Querés subir otro documento?"

**Pasos:**
1. Wizard step 2.
2. Subir 1 PDF a la card de Cédula.
3. ¿Aparece modal "¿Querés subir otro documento?"?
4. ¿Tiene 2 botones: "No, ya está" y "Sí, subir otro"?
5. Click "Sí, subir otro" → vuelve a abrir el file picker.

**Status:** ⏳ Pending

---

### AC-11: Finalizar NO re-crea la propiedad (UPSERT)

**Pasos:**
1. Wizard abierto, propiedad ya persistida (de AC-1 o AC-2).
2. Completar step 2 (subir al menos el Mandato si querés que pase a Activo,
   o dejarlo pendiente).
3. Step 3: completar el inventario mínimamente (1 área, 1 item).
4. Click "Finalizar".
5. **Esperar máx 30s**. NO cerrar nada.
6. En phpMyAdmin: `SELECT id, address, status FROM properties WHERE address = 'TEST-AC1';`
7. ¿La fila sigue existiendo (no se creó duplicado)?
8. ¿El status es 'Activo' (si subiste Mandato) o 'Pendiente' (si no)?

**Resultado esperado:**
- 1 sola fila (no duplicado)
- Status correcto según Mandato

**Status:** ⏳ Pending

---

### AC-12: Modal de resumen post-finalize

**Pasos:**
1. Después de finalizar (AC-11), ¿aparece el modal de resumen?
2. ¿Tiene 4 secciones: En Drive / Solo local / Faltantes / Errores?
3. ¿El modal NO se auto-dismiss? (esperar 30s sin cerrarlo, debe seguir ahí)
4. ¿Tiene botones "Ver carpeta en Drive" y "Cerrar"?
5. Click "Ver carpeta en Drive" → ¿abre nueva pestaña con la carpeta de Drive?

**Status:** ⏳ Pending

---

### AC-13: Discard borra la propiedad de MySQL

**Pasos:**
1. Wizard abierto en step 1, propiedad persistida (de AC-1 o AC-2).
2. Click "Descartar borrador" (esquina superior derecha del wizard).
3. Confirmar en el modal "¿Descartar borrador?".
4. **Esperar 5s**.
5. En phpMyAdmin: `SELECT * FROM properties WHERE address = 'TEST-AC1';`
6. ¿La fila fue borrada?

**Status:** ⏳ Pending

---

### AC-14: Draft restoration con wizardPropertyDbId

**Pasos:**
1. Crear una propiedad nueva (TEST-AC14) sin finalizar el wizard.
2. Click "Continuar a Documentación" (AC-1).
3. **Cerrar el browser** completamente.
4. **Reabrir** la app y volver a abrir el wizard.
5. ¿Se restaura el wizard en step 1 con los datos de TEST-AC14?
6. Click "Continuar a Documentación" — ¿se crea OTRA fila en MySQL o se
   reutiliza la existente (idempotente)?

**Resultado esperado:**
- Wizard restaurado
- Solo 1 fila en MySQL (no se duplica)

**Status:** ⏳ Pending

---

### AC-15: NUNCA se persisten blob URLs (drive URL o nada)

> **Contexto del bug** (23-jul-2026): 3 docs (Cédula de Fredy, Cédula de Esperanza,
> Certificado de Tradición principal) NO se persistieron en MySQL cuando el agente
> subió docs al wizard. El server tenía `blob:https://inmocontrol.tecnowebs...` en
> `property_documents.file_url` y al refrescar el browser el blob expiró.
> El Detalle del Inmueble mostraba "Ver" verde pero el visor decía "moved, edited,
> or deleted" porque el blob URL ya no existía.

**Fix implementado** (3 capas de defensa — ver `docs/specs/wizard_property.md` AC-15):
1. Cliente Caso B (`PropertiesView.tsx:626-647`): si `docUrl` es `blob:`, NO postea a `/api/properties`.
2. Cliente `handleFinalize` (`PropertiesView.tsx:1071+`): fuente de verdad es `uploadedDocs` (no `wizardFiles`).
3. Server (`server/routes/properties.ts:475-484`): rechaza `blob:`/`data:` URLs con log warning.

**Sub-test AC-15.A: Server rechaza blob URLs (capa 3 — defensa raíz)**

```powershell
# Test: enviar un POST a /api/properties con un blob URL en documents.
# Esperado: el server NO crea la fila en property_documents, log warning.
$body = @"
{
  "localId": "TEST-AC15A",
  "address": "TEST AC-15.A",
  "chip": "AAATEST15A",
  "folio": "50NTEST15A",
  "ownerName": "Test Owner",
  "documents": {
    "cedula:OWNERID": "blob:https://inmocontrol.tecnowebsupportia.com/fake-uuid-1234"
  }
}
"@
$res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/properties" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
# Esperado: 200 (la propiedad se crea OK), pero property_documents NO tiene la fila blob.

# Verificar en phpMyAdmin:
# SELECT * FROM property_documents
#  WHERE property_id = (SELECT id FROM properties WHERE address = 'TEST AC-15.A')
#    AND file_url LIKE 'blob:%';
# Esperado: 0 filas. Si hay 1+ → FAIL.
```

**Status:** ⏳ Pending

---

**Sub-test AC-15.B: Cliente NO postea blob URLs (capa 1)**

**Pasos manuales:**
1. DevTools → Network → Block `*googleapis.com*` (simular Drive caído).
2. Abrir Detalle del Inmueble de cualquier propiedad (debe tener Drive folder asociado).
3. Subir un PDF a la card de Cédula de un owner.
4. **Verificar toast**: NO debe decir "Documento guardado en este navegador" — debe decir algo como "Reconectá Drive y reintentá la subida".
5. En phpMyAdmin:
   ```sql
   SELECT file_url FROM property_documents
    WHERE property_id = 'X' AND file_url LIKE 'blob:%';
   ```
   Esperado: **0 filas** (el cliente NO mandó el POST al server).
6. **Verificar el card en la UI**: muestra botón ámbar "Re-subir" + tooltip "Archivo previo perdido" (porque la URL es blob en el state local del card).

**Status:** ⏳ Pending

---

**Sub-test AC-15.C: Caso C del wizard — URLs de Drive SÍ se persisten inmediatamente**

**Pasos manuales (el fix más importante):**
1. Hard refresh del browser.
2. Wizard → step 1 → llenar datos válidos → "Continuar a Documentación" (debe persistir en MySQL con `status='Pendiente'`).
3. Step 2: subir un PDF a la card de Cédula de un owner.
4. **Verificar toast**: "✓ Cedula_Nombre_Owner.pdf subido a Drive".
5. **Refrescar la página INMEDIATAMENTE (Ctrl+Shift+R)** sin finalizar el wizard.
6. Re-abrir el wizard → debería restaurar `wizardPropertyDbId` y los `uploadedDocs`.
7. Click "Finalizar" (incluso con wizard sin inventario).
8. En phpMyAdmin:
   ```sql
   SELECT file_url FROM property_documents WHERE property_id = 'X';
   ```
   Esperado: la URL es `https://drive.google.com/...`, NO `blob:...`.

**Status:** ⏳ Pending

---

**Sub-test AC-15.D: handleFinalize usa uploadedDocs como fuente de verdad (capa 2)**

**Pasos:**
1. Wizard → step 1 → "Continuar a Documentación" (AC-1 ya validado).
2. Step 2: subir 2 PDFs a slots distintos (caso Cédula + Predial).
3. **Refrescar la página** antes de finalizar → el `wizardFiles` (en memoria) se pierde, pero `uploadedDocs` (en localStorage) se restaura.
4. Re-abrir wizard → restaurar state.
5. Step 3: completar inventario mínimamente → click "Finalizar".
6. En phpMyAdmin:
   ```sql
   SELECT file_url FROM property_documents WHERE property_id = 'X';
   ```
   Esperado: 2 filas con URLs `https://drive.google.com/...` (las del Caso C). **Si hay 0 filas o URLs blob → FAIL.**

**Status:** ⏳ Pending

---

### AC-16: URLs de Drive persistidas siempre son válidas (proxy funciona)

> **Contexto**: el bug fue que `property_documents.file_url` tenía un `webViewLink`
> de Drive (`https://drive.google.com/file/d/.../view?usp=drivesdk`) pero al abrir
> el visor embebido decía "moved, edited, or deleted". La causa: el archivo en
> Drive SÍ existía pero la URL directa al visor de Drive requiere login de Google.
> El fix: el viewer de InmoControl usa `/api/drive/file?fileId=X` (proxy server-side)
> que sirve el PDF con el OAuth token del server.

**Sub-test AC-16.A: El visor embebido usa el proxy, NO la URL directa**

**Pasos:**
1. Hard refresh del browser.
2. Abrir Detalle del Inmueble de una propiedad con un doc subido (ej: Cédula).
3. Click "Ver" en la card.
4. **DevTools → Network**: filtrar por `file?fileId=`.
5. **Verificar**: la request es a `/api/drive/file?fileId=XXXX`, NO a `https://drive.google.com/...`.
6. **Verificar la response**: status 200, Content-Type `application/pdf`.
7. **Verificar el iframe**: muestra el PDF, NO el mensaje "moved, edited, or deleted".

**Status:** ⏳ Pending

---

**Sub-test AC-16.B: El proxy responde 200 para archivos válidos, 404 para inválidos**

```powershell
# Test: el proxy funciona para un fileId real (sacado de la DB).
# Reemplazar FILE_ID con un valor de property_documents.file_url.
$fileId = "1A2b3C4d5E6f7G8h"  # TODO: cambiar por uno real
$res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/drive/file?fileId=$fileId" `
  -Method GET -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
Write-Host "Content-Type: $($res.Headers['Content-Type'])"
# Esperado: 200 + Content-Type: application/pdf.
# Si es 404 → el archivo en Drive no existe (FAIL del fix anterior).
# Si es 503 → Drive no conectado (FAIL del check de status).
# Si es 403 → token sin permisos (FAIL del OAuth).
```

**Status:** ⏳ Pending

---

**Sub-test AC-16.C: Las URLs zombie (blob) muestran badge honesto en el Detalle**

**Pasos:**
1. Limpiar TODAS las filas zombie de la DB primero:
   ```sql
   DELETE FROM property_documents WHERE file_url LIKE 'blob:%';
   ```
2. Re-abrir la propiedad donde estaban las zombie rows (KR 12 142 74 AP 303).
3. **Verificar**: las cards (Cédulas, Certificados, Mandato) muestran botón ámbar "Re-subir", NO botón verde "Ver".
4. Re-subir el PDF de Cédula de un owner.
5. **Verificar**: ahora muestra "Ver" verde, y al click abre el PDF correctamente.

**Status:** ⏳ Pending

---

### AC-17: Discard confirma antes de borrar archivos ya subidos a Drive

> **Contexto**: si el agente sube un PDF a Drive durante el wizard y luego clickea
> "Descartar borrador", se borra la propiedad de MySQL y la carpeta de Drive.
> PERO los archivos ya subidos también desaparecen sin warning.
> Fix: mostrar modal con lista de archivos a perder + advertencia explícita.

**Sub-test AC-17.A: Modal de confirmación aparece si hay archivos en Drive**

**Pasos:**
1. Wizard → step 1 → "Continuar a Documentación" (propiedad persistida en MySQL).
2. Step 2: subir 1 PDF a cualquier card con Drive conectado.
3. Step 2: NO finalizar. Click en "Descartar borrador" (esquina superior).
4. **Verificar modal**: aparece con la lista explícita:
   > "Vas a perder 1 archivo ya subido a Drive:
   > • Cedula_Nombre.pdf (1.2 MB)
   > ¿Continuar?"
5. Botones: "Cancelar" + "Sí, descartar".

**Status:** ⏳ Pending

---

**Sub-test AC-17.B: Cancelar preserva todo (rollback) — happy path**

**Pasos:**
1. Wizard abierto con 1 PDF ya subido a Drive.
2. Click "Descartar borrador" → modal aparece.
3. Click "Cancelar".
4. **Verificar**: el modal se cierra, la propiedad SIGUE en MySQL, los archivos SIGUEN en Drive.
5. En phpMyAdmin: la fila de la propiedad y la fila de property_documents siguen existiendo.

**Status:** ⏳ Pending

---

**Sub-test AC-17.C: Confirmar borra propiedad + archivos de Drive**

**Pasos:**
1. Wizard abierto con 1 PDF ya subido a Drive.
2. Click "Descartar borrador" → modal aparece.
3. Click "Sí, descartar".
4. **Verificar**: modal se cierra, wizard se resetea a step 1.
5. En phpMyAdmin:
   ```sql
   SELECT * FROM properties WHERE address = 'TEST-AC17';
   SELECT * FROM property_documents WHERE property_id = 'X';
   ```
   Esperado: 0 filas en ambas.
6. En Google Drive: el archivo YA NO está en la carpeta de la propiedad.

**Status:** ⏳ Pending

---

**Sub-test AC-17.D: Discard sin archivos en Drive (propiedad solo persistida)**

**Pasos:**
1. Wizard → step 1 → "Continuar a Documentación" (AC-1) — sin subir ningún doc.
2. Click "Descartar borrador".
3. **Verificar modal**: aparece con texto simple "Esta propiedad todavía no tiene archivos. ¿Continuar?" (sin lista de archivos).
4. Click "Sí, descartar".
5. En phpMyAdmin: la fila de la propiedad debe haber sido borrada.

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Drive caído completamente (todo el wizard)

**Pasos:**
1. Block `*googleapis.com*` en DevTools.
2. Hacer TODO el wizard: AC-1 + subir 1 doc + finalizar.
3. ¿El wizard completa en <60s sin colgarse?
4. ¿La propiedad queda en MySQL con `drive_folder_id=NULL`?
5. ¿Aparece el modal de resumen al final?

**Status:** ⏳ Pending

---

### EC-13: Doble click en "Continuar a Documentación"

**Pasos:**
1. Wizard step 1 con datos llenos.
2. Click rápido 2 veces en "Continuar a Documentación".
3. ¿Se crean 2 filas en MySQL o solo 1?

**Status:** ⏳ Pending

---

## Resumen de ejecución

| Check | Status | Notas |
|-------|--------|-------|
| PRE-1 | ✅ | health check OK |
| AC-1 | ⏳ | — |
| AC-2 | ⏳ | — |
| AC-3 | ⏳ | — |
| AC-4 | ⏳ | — |
| AC-5 | ⏳ | — |
| AC-6 | ✅ | errores devuelven JSON, no HTML |
| AC-7 | ⏳ | — |
| AC-8 | ⏳ | — |
| AC-9 | ⏳ | — |
| AC-10 | ⏳ | — |
| AC-11 | ⏳ | — |
| AC-12 | ⏳ | — |
| AC-13 | ⏳ | — |
| AC-14 | ⏳ | — |
| **AC-15.A** | ⏳ | **server rechaza blob URLs** (defensa raíz) |
| **AC-15.B** | ⏳ | **cliente NO postea blob** (Caso B del Detalle) |
| **AC-15.C** | ⏳ | **Caso C wizard persiste inmediatamente** |
| **AC-15.D** | ⏳ | **handleFinalize usa uploadedDocs** (sobrevive refresh) |
| **AC-16.A** | ⏳ | **visor usa proxy** (no URL directa) |
| **AC-16.B** | ⏳ | **proxy responde 200/404** (archivos válidos/inválidos) |
| **AC-16.C** | ⏳ | **URLs zombie muestran badge honesto** |
| **AC-17.A** | ⏳ | **modal aparece con archivos a perder** |
| **AC-17.B** | ⏳ | **cancelar preserva todo** (rollback) |
| **AC-17.C** | ⏳ | **confirmar borra propiedad + archivos** |
| **AC-17.D** | ⏳ | **discard sin archivos** (mensaje simple) |
| EC-1 | ⏳ | — |
| EC-13 | ⏳ | — |

**Veredicto final:**
- ✅ ALL PASS → listo para commit + push
- ❌ N FAIL → volver a Fase 4 (implementación). **NO tocar este verifier.**

## Historial de ejecuciones

| Fecha | Commit deployado | Pass / Total | Notas |
|-------|------------------|--------------|-------|
| 2026-07-22 | baseline (post-deploys de la sesión) | 0/17 | primera ejecución — esperamos ver varios FAILs |
| 2026-07-23 | (post-update del spec con AC-15/16/17) | ⏳ | esperando browser checks del user |
| 2026-07-23 | `4c6a6e9` (3 capas defensa) + `47a8272` (Drive honesto) | ⏳ | deployado. AC-15, AC-16, AC-17 reescritos con sub-tests. Esperando ejecución en prod. |
