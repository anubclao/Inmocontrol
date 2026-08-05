# Verifier — fix_wizard_docs_persistence (E2E checklist binario)

> Cada AC tiene uno o más pasos verificables. Marcá ✅ o ❌.
> NO modifiques este archivo para hacer pasar los checks — eso es trampa.
> Si falla, el código está mal.

## Pre-requisitos

- DB `u652436213_inmocontrol` con schema importado y al menos 1 organización.
- App corriendo en `https://inmocontrol.tecnowebsupportia.com/`.
- DevTools abierto en Network + Console tabs.
- Cache del browser limpio (Ctrl+F5).

---

## AC-1 — Documentos visibles en el detalle tras finalizar wizard

### AC-1.1 — Modal de detalle muestra los documentos subidos

- [ ] Ir a `https://inmocontrol.tecnowebsupportia.com/`
- [ ] Click en **"Nueva Captación"**
- [ ] Step 1: completar datos básicos con una dirección única (ej: `TEST-VERIFIER-001, Calle 100 #15-20`)
- [ ] Click **"Continuar a Documentación"**
- [ ] Step 2: subir al menos 2 archivos distintos (uno como CC, otro como Certificado) usando el slot de Drive
- [ ] Verificar que los badges de cada slot muestran 🟢 "En Drive" con URL `https://drive.google.com/...`
- [ ] Step 3: completar inventario con valores básicos
- [ ] Click **"Finalizar"**
- [ ] En el modal de resumen que aparece, click **"Ver detalle de la propiedad"**
- [ ] ✅ El modal de detalle muestra los 2 documentos en sus slots correctos con badge 🟢
- [ ] ✅ NO hay badges 🟠 "Pendiente → Drive" ni URLs `blob:`

### AC-1.2 — Refetch usa `GET /api/properties/:id` y devuelve URLs de Drive

- [ ] DevTools → Network → filtrar `properties/`
- [ ] Al abrir el detalle, debe aparecer un request `GET /api/properties/<uuid>` con status 200
- [ ] Click en la pestaña "Response" del request
- [ ] ✅ El array `documents` tiene al menos 2 entradas con `file_url` que empieza con `https://drive.google.com/`

### AC-1.3 — NO hay URLs `blob:` después de cerrar el wizard

- [ ] DevTools → Console
- [ ] ✅ No hay warnings de "blob URL not found" ni errores 404 al cargar imágenes

---

## AC-2 — Auto-save del inventario

### AC-2.1 — Cualquier cambio persiste a localStorage en < 500ms

- [ ] Abrir DevTools → Application → Local Storage → `https://inmocontrol.tecnowebsupportia.com`
- [ ] Click en **"Nueva Captación"** o entrar a una propiedad existente con Inventario en step 3
- [ ] Step 3: Inventario → cambiar el valor de un contador (ej: de 0 a 12345)
- [ ] Esperar 1 segundo
- [ ] ✅ En Local Storage debe aparecer la clave `inmocontrol:draft:inventory:<propertyId>`
- [ ] ✅ El JSON guardado contiene el valor nuevo (12345)

### AC-2.2 — Flush a MySQL cada 5 seg

- [ ] DevTools → Network → filtrar `inventories`
- [ ] Mantener el wizard abierto y modificar un valor
- [ ] Esperar 6 segundos sin hacer nada
- [ ] ✅ Aparece un `POST /api/inventories` con status 200
- [ ] ✅ El body del POST incluye el valor modificado

### AC-2.3 — Restauración al volver a entrar

- [ ] Con el draft anterior aún en localStorage, **cerrar la pestaña** sin finalizar
- [ ] Abrir una nueva pestaña en `https://inmocontrol.tecnowebsupportia.com/`
- [ ] Ir a la misma propiedad → step 3 (Inventario)
- [ ] ✅ Aparece un toast no-bloqueante: "🔄 Avance del inventario restaurado — última edición: 2026-..."
- [ ] ✅ El campo modificado tiene el valor guardado (12345 en este ejemplo)

### AC-2.4 — Draft se limpia al finalizar

- [ ] Terminar el wizard clickeando **"Finalizar"** exitosamente
- [ ] DevTools → Application → Local Storage
- [ ] ✅ La clave `inmocontrol:draft:inventory:<propertyId>` ya NO existe

---

## AC-3 — Lista de propiedades refresca al volver del wizard

### AC-3.1 — Refetch en mount

- [ ] Crear una propiedad nueva "TEST-VERIFIER-002"
- [ ] Sin recargar (sin F5), ir a otra vista (ej: Contratos)
- [ ] Volver a "Propiedades" (sidebar)
- [ ] DevTools → Network → filtrar `properties`
- [ ] ✅ Aparece un `GET /api/properties` con status 200 al volver
- [ ] ✅ La lista incluye "TEST-VERIFIER-002" sin haber hecho F5

### AC-3.2 — Propiedades recientes sin F5

- [ ] ✅ (mismo test que AC-3.1) — la propiedad creada en los últimos 5 min se ve inmediatamente

### AC-3.3 — Highlight de recién creada

- [ ] Después de finalizar el wizard de "TEST-VERIFIER-003"
- [ ] Volver a la lista de propiedades
- [ ] ✅ La card de "TEST-VERIFIER-003" tiene un borde azul (highlight) durante 3 segundos
- [ ] ✅ Después de 3 segundos, el highlight se desvanece

---

## Edge cases

### E1 — Validación falla en step 2

- [ ] Step 1: completar datos
- [ ] Step 2: intentar avanzar con un slot de doc vacío (si hay validación)
- [ ] ✅ Aparece error inline; el doc blob queda en localStorage como backup

### E4 — Server down durante auto-save

- [ ] DevTools → Network → marcar "Offline"
- [ ] Modificar un contador en el Inventario
- [ ] Esperar 6 seg
- [ ] ✅ Aparece toast: "Sin conexión — el avance queda solo en este navegador"

### E5 — Botón descartar avance

- [ ] En step 3 con cambios sin guardar
- [ ] Click en **"Descartar avance"**
- [ ] ✅ Aparece confirmación: "¿Seguro? Se perderán los X cambios no guardados"
- [ ] Aceptar
- [ ] ✅ Aparece toast: "🗑 Avance descartado"
- [ ] ✅ La clave de localStorage se elimina
- [ ] ✅ Si había draft en MySQL, se hace `DELETE /api/inventories/:id` (verificar en Network)

### E6 — 2 propiedades en paralelo

- [ ] Abrir propiedad A en tab 1
- [ ] Abrir propiedad B en tab 2
- [ ] Modificar contador en A
- [ ] ✅ La clave de localStorage incluye el propertyId de A (no de B)
- [ ] ✅ Modificar contador en B no afecta a A

---

## Tareas de regresión (no relacionadas al fix, pero no romper)

- [ ] `GET /api/health` devuelve `{"db":{"ok":true}}` — la DB no se rompió
- [ ] `GET /api/properties` sigue devolviendo la lista con `inventory_count`
- [ ] El wizard de propiedad sigue creando con status "Pendiente"
- [ ] El upload a Drive sigue funcionando (badge 🟢)

---

## Done = todos los checks ✅

Si alguno falla, **NO** modifiques este archivo. Arreglá el código y volvé a correr.
