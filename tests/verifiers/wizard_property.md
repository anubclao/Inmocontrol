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
| PRE-1 | ⏳ | — |
| AC-1 | ⏳ | — |
| AC-2 | ⏳ | — |
| AC-3 | ⏳ | — |
| AC-4 | ⏳ | — |
| AC-5 | ⏳ | — |
| AC-6 | ⏳ | — |
| AC-7 | ⏳ | — |
| AC-8 | ⏳ | — |
| AC-9 | ⏳ | — |
| AC-10 | ⏳ | — |
| AC-11 | ⏳ | — |
| AC-12 | ⏳ | — |
| AC-13 | ⏳ | — |
| AC-14 | ⏳ | — |
| EC-1 | ⏳ | — |
| EC-13 | ⏳ | — |

**Veredicto final:**
- ✅ ALL PASS → listo para commit + push
- ❌ N FAIL → volver a Fase 4 (implementación). **NO tocar este verifier.**

## Historial de ejecuciones

| Fecha | Commit deployado | Pass / Total | Notas |
|-------|------------------|--------------|-------|
| 2026-07-22 | baseline (post-deploys de la sesión) | 0/17 | primera ejecución — esperamos ver varios FAILs |
