# Verifier: Wizard de Tenant — E2E Checklist

> **Karpathy Verifier** — Julio 2026. Cada Acceptance Criterion de
> `docs/specs/wizard_tenant.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un
> check falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (verificar último commit en hPanel).
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
# Pegar en phpMyAdmin → SQL
DELETE FROM tenants WHERE document_id LIKE 'TEST-%';
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

### AC-1: Modal "Nuevo Arrendatario" valida campos obligatorios

**Pasos:**
1. Hard refresh (Ctrl+Shift+R).
2. Arrendatarios → "+ Nuevo Arrendatario".
3. Dejar nombre en blanco. Click "Crear".
4. **Esperado**: error inline en el campo nombre, NO se cierra el modal.
5. Llenar nombre, dejar cédula en blanco. Click "Crear".
6. **Esperado**: error inline en cédula.
7. Llenar todos los campos. Click "Crear".

**Resultado esperado:**
- Modal se cierra solo si todos los campos requeridos están llenos.
- Toast: "✓ {nombre} creado — completa el Inventario de Colocación para activar la propiedad".

**Status:** ⏳ Pending

---

### AC-2: Modal ABIERTO durante el POST (no se cierra antes)

**Pasos:**
1. DevTools → Network → Throttling → "Slow 3G".
2. Abrir modal de Crear. Llenar datos válidos.
3. Click "Crear".
4. **Verificar**: el botón muestra spinner + "Creando…" y está disabled.
5. Esperar la respuesta (~5-10s en Slow 3G).
6. **Verificar**: el modal SIGUE abierto durante el POST.
7. Solo se cierra cuando el server responde 200.

**Resultado esperado:**
- Modal NO se cierra antes del server.
- Botón disabled + spinner durante el POST.
- Si el POST tarda >15s → AbortController + toast "El servidor tardó demasiado".

**Status:** ⏳ Pending

---

### AC-3: Al crear OK → toast honesto + tenant persistido

```powershell
# Verificar en phpMyAdmin:
SELECT id, name, document_id, property_id, status, tenant_drive_folder_id
FROM tenants
WHERE name = 'TEST-TENANT-AC3';
```

**Esperado**: 1 fila con `status='Activo'`. Si Drive está conectado, `tenant_drive_folder_id != NULL`.

**Status:** ⏳ Pending

---

### AC-4: Subir Cédula del tenant va a Drive en tiempo real

**Pasos:**
1. Detalle del Inquilino (cualquier tenant activo).
2. Click "Subir PDF" en la card de Cédula.
3. Elegir un PDF.
4. **Verificar**: toast "✓ Cédula subida a Drive".
5. **Verificar**: badge 🟢 "En Drive" en la card.

```powershell
# Verificar en phpMyAdmin:
SELECT file_url FROM property_documents
WHERE property_id = 'X' AND doc_type = 'cedula';
```

**Esperado**: `file_url` empieza con `https://drive.google.com/...` (NO `blob:`).

**Status:** ⏳ Pending

---

### AC-5: La cédula se refresca desde Drive al abrir el Detalle

**Pasos:**
1. Subir una cédula (AC-4).
2. **Cerrar el modal** del Detalle.
3. **Hard refresh** del browser (Ctrl+Shift+R).
4. Re-abrir el mismo Detalle.
5. **Verificar**: la card de Cédula muestra el archivo subido (no "Subir PDF" como si nada se hubiera subido).

**Status:** ⏳ Pending

---

### AC-6: Inventario de Colocación requiere 2 firmas

**Pasos:**
1. Detalle del Inquilino de un tenant Activo.
2. Click "Abrir Inventario de Colocación".
3. Llenar 1 área con 1 item en estado "Bueno".
4. **Verificar**: el botón "Firmar" está DISABLED (no hay firmas).
5. Firmar como arrendatario. **Verificar**: el botón SIGUE disabled (falta firma del agente).
6. Firmar como agente. **Verificar**: el botón se habilita.

**Status:** ⏳ Pending

---

### AC-7: Al firmar el Inventario de Colocación se crea el contrato

**Pasos:**
1. Tenant en "En Colocación" (sin contrato activo).
2. Abrir Inventario de Colocación.
3. Firmar (tenant + agente) → click "Firmar".
4. **Verificar**: toast "Inventario de colocación firmado — contrato creado, propiedad ahora Arrendada".

```powershell
# Verificar en phpMyAdmin:
SELECT id, property_id, tenant_id, status, rent_amount, admin_fee
FROM contracts
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'TEST-TENANT-AC7');
# Esperado: 1 fila con status='active'.

SELECT id, status FROM properties WHERE id = 'X';
# Esperado: status='Arrendado'.
```

**Status:** ⏳ Pending

---

### AC-8: El BillingSetupWizard se abre después de firmar el Inventario

**Pasos:**
1. Después de AC-7, **verificar** que el wizard de Billing se abre automáticamente.
2. Si la propiedad YA tiene policy: el wizard se cierra con toast "Esta propiedad ya tiene política de facturación."
3. Si no: el agente puede configurar o cancelar.

**Status:** ⏳ Pending

---

### AC-9: El Acta de Entrega se genera desde el Detalle

**Pasos:**
1. Detalle del Inquilino → card "Acta de Entrega" → "Generar acta".
2. Llenar el formulario (ciudad, fecha, servicios, llaves, observaciones).
3. Click "Generar y guardar en Drive".
4. **Verificar**: toast "✓ Acta de Entrega guardada en Drive → {nombre}/Acta/".
5. **Verificar**: la card muestra badge "Firmado" + link "Ver" al PDF.

```powershell
# Verificar en Google Drive:
# Buscar en la carpeta del tenant → Acta/ → debe haber 1 PDF reciente.
```

**Status:** ⏳ Pending

---

### AC-10: El Acta NO bloquea la facturación

**Pasos:**
1. Tenant Activo SIN acta generada.
2. **Verificar**: el banner del Detalle dice "No generaste el Acta de Entrega... No bloquea facturación. Click acá para generarla."
3. El banner tiene un CTA que abre el ActaEntregaModal.

**Status:** ⏳ Pending

---

### AC-11: Top-level try/catch + JSON errors

```powershell
# Test: enviar un body malformado al POST /api/tenants
$body = '{"name":""}'  # falta todo lo demás
$res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/tenants" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
Write-Host $res.Content
```

**Esperado**: 400 con body JSON `{ "error": "..." }`. NO debe empezar con `<html>`.

**Status:** ⏳ Pending

---

### AC-12: Drive operations timeout 8s server-side

**Pasos:**
1. DevTools → Network → Block `*googleapis.com*`.
2. Crear un nuevo tenant.
3. **Esperado**: el server responde en <10s (no se cuelga).
4. Toast: "Drive no disponible" o similar.

**Resultado esperado:**
- Server responde 200/400 con error JSON.
- La propiedad se crea igual en MySQL (Drive es opcional).
- Tiempo total <10s.

**Status:** ⏳ Pending

---

### AC-13: Cliente timeout 15s via AbortController

**Pasos:**
1. DevTools → Network → Throttling → "Slow 3G".
2. Crear un tenant.
3. **Esperado**: si el server tarda >15s → toast "El servidor tardó demasiado. Reintentá en unos segundos."

**Status:** ⏳ Pending

---

### AC-14: El botón "Generar acta" se deshabilita durante la subida

**Pasos:**
1. Generar un acta (AC-9).
2. **Verificar**: el botón muestra spinner + "Generando…" durante la subida a Drive.
3. **Verificar**: el botón está disabled (no se puede hacer doble click).

**Status:** ⏳ Pending

---

### AC-15: El estado de Drive se chequea al abrir el Detalle

**Pasos:**
1. Configuración → Integraciones → desconectar Drive (botón "Desconectar").
2. Re-abrir el Detalle de un Inquilino.
3. **Verificar**: aparece el banner "Google Drive no está conectado" o "Tu sesión de Google Drive expiró".
4. **Verificar**: NO aparece el toast rojo "No hay conexión con Google Drive" (fix de commit `0cda846`).

**Status:** ⏳ Pending

---

### AC-16: Cerrar modal sin confirmar limpia el state

**Pasos:**
1. Abrir modal de Crear Arrendatario. Llenar nombre="TEST-ABANDONO".
2. Click "Cancelar".
3. Re-abrir el modal de Crear.
4. **Verificar**: el campo nombre está VACÍO (no tiene "TEST-ABANDONO").

```powershell
# Verificar en phpMyAdmin que NO se creó el tenant:
SELECT * FROM tenants WHERE name LIKE 'TEST-ABANDONO%';
# Esperado: 0 filas.
```

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Nombre con solo espacios

**Pasos:**
1. Modal Crear. Nombre = "   ". Cédula = "12345". Resto OK.
2. Click "Crear".
3. **Verificar**: error inline "El nombre es obligatorio". NO se envía el POST.

**Status:** ⏳ Pending

---

### EC-2: Cédula ya existe (otro tenant en la misma org)

**Pasos:**
1. Crear tenant A con cédula "11111111".
2. Intentar crear tenant B con cédula "11111111" (mismo nombre OK).
3. **Verificar**: el server devuelve 409 Conflict.
4. Toast: "Ya existe un inquilino con esa cédula. Verificá los datos."
5. Modal NO se cierra.

**Status:** ⏳ Pending

---

### EC-3: Server tarda >15s (Slow 3G)

**Pasos:**
1. DevTools → Throttling → Slow 3G.
2. Crear un tenant.
3. **Esperado**: AbortController a los 15s.
4. Toast: "El servidor tardó demasiado. Reintentá en unos segundos."
5. Modal NO se cierra.

**Status:** ⏳ Pending

---

### EC-4: Subir archivo que NO es PDF

**Pasos:**
1. Detalle del Inquilino → card Cédula → "Subir PDF".
2. Elegir un .jpg o .txt.
3. **Verificar**: el server rechaza (400) o el cliente valida antes.

**Status:** ⏳ Pending

---

### EC-5: Inventario firmado pero server caído al crear contrato

**Pasos:**
1. Simular server caído (DevTools → Offline).
2. Firmar Inventario de Colocación.
3. **Verificar**: el inventario SÍ se firma localmente.
4. Toast de error: "Inventario firmado, pero no se pudo crear el contrato. Contactá al admin: ..."
5. La propiedad igual pasa a 'Arrendado' (consistente con el diseño actual).

**Status:** ⏳ Pending

---

### EC-6: Cancelar modal "Generar acta"

**Pasos:**
1. Detalle del Inquilino → "Generar acta" → llenar formulario.
2. Click "Cancelar".
3. **Verificar**: el modal se cierra. NO se genera PDF.
4. La card sigue mostrando "Generar acta" (no "Firmado").

**Status:** ⏳ Pending

---

### EC-7: Carpeta del tenant ya existe (idempotente)

**Pasos:**
1. Tenant con `tenantDriveFolderId` ya seteado.
2. Re-abrir el Detalle.
3. **Verificar**: no se hace un nuevo POST a `/ensure-drive-folder`.
4. El folderId existente se usa directamente.

**Status:** ⏳ Pending

---

### EC-8: User abre Detalle sin Drive conectado

**Pasos:**
1. Configuración → desconectar Drive.
2. Re-abrir Detalle del Inquilino.
3. **Verificar**: aparece el DriveStatusBanner arriba (no toast rojo).
4. Las cards de Cédula/Acta/Contrato/Recibos siguen visibles pero los botones de subir están deshabilitados o bloqueados con mensaje.

**Status:** ⏳ Pending

---

### EC-9: Crear tenant con propertyId inválido

```powershell
$body = '{"name":"Test","documentId":"99999999","propertyId":"00000000-0000-0000-0000-000000000000","rent":1000000}'
$res = Invoke-WebRequest "https://inmocontrol.tecnowebsupportia.com/api/tenants" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
Write-Host $res.Content
```

**Esperado**: 400 con JSON `{ "error": "La propiedad 00000000-... no existe" }`.

**Status:** ⏳ Pending

---

### EC-10: adminFee con solo espacios

**Pasos:**
1. Modal Crear. adminFee = "  ".
2. **Verificar**: el form NO permite submit (validación inline).
3. **Si se permite**: el server persiste 0 (no 1 o NaN).

**Status:** ⏳ Pending

---

## Resumen de ejecución

| Check | Status | Notas |
|-------|--------|-------|
| PRE-1 | ⏳ | health check |
| AC-1 | ⏳ | validación de campos |
| AC-2 | ⏳ | modal abierto durante POST |
| AC-3 | ⏳ | toast honesto + persistencia |
| AC-4 | ⏳ | upload a Drive en tiempo real |
| AC-5 | ⏳ | refresh desde Drive |
| AC-6 | ⏳ | requiere 2 firmas |
| AC-7 | ⏳ | crea contrato al firmar |
| AC-8 | ⏳ | abre BillingSetupWizard |
| AC-9 | ⏳ | Acta de Entrega |
| AC-10 | ⏳ | Acta no bloquea facturación |
| AC-11 | ⏳ | try/catch + JSON |
| AC-12 | ⏳ | server timeout 8s |
| AC-13 | ⏳ | client timeout 15s |
| AC-14 | ⏳ | botón disabled |
| AC-15 | ⏳ | Drive status check |
| AC-16 | ⏳ | state reset on cancel |
| EC-1 | ⏳ | nombre con espacios |
| EC-2 | ⏳ | cédula duplicada |
| EC-3 | ⏳ | timeout 15s |
| EC-4 | ⏳ | archivo no PDF |
| EC-5 | ⏳ | server caído al firmar |
| EC-6 | ⏳ | cancelar Acta |
| EC-7 | ⏳ | ensure-drive-folder idempotente |
| EC-8 | ⏳ | Detalle sin Drive |
| EC-9 | ⏳ | propertyId inválido |
| EC-10 | ⏳ | adminFee con espacios |

**Veredicto final:**
- ✅ ALL PASS → listo para commit + push
- ❌ N FAIL → volver a Fase 4 (implementación). **NO tocar este verifier.**

## Historial de ejecuciones

| Fecha | Commit deployado | Pass / Total | Notas |
|-------|------------------|--------------|-------|
| 2026-07-23 | baseline | 0/26 | primera ejecución — esperamos ver varios FAILs |
