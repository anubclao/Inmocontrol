# Verifier: Fix BUG-019 — hydrate() con timeouts

> **Karpathy Verifier** — Agosto 2026. Cada AC de
> `docs/specs/fix-bug-019-hydrate-timeouts.md` se traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un check
> falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- Deploy de Hostinger completo (último commit en hPanel).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- DevTools (F12 → Network) en incógnito
- Para tests de timeout: DevTools → Network → Throttling → Slow 3G o Block specific endpoint

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

### AC-1: Cada endpoint individual tiene timeout 15s

**Pasos:**

1. DevTools → Network → Throttling → Slow 3G.
2. Hard refresh (Ctrl+Shift+R).
3. **Verificar**: la app termina de cargar en <20s.
4. DevTools → Console → buscar logs de `[hydrate]` o `TimeoutError`.
5. **Verificar**: si algún endpoint se demora, se loguea como warning, no rompe la app.

**Status:** ⏳ Pending

---

### AC-2: hydrate() continúa aunque un endpoint falle

**Pasos:**

1. DevTools → Network → Block `*/api/tenants` (solo ese endpoint).
2. Hard refresh.
3. **Verificar**: la app carga con `properties` pero sin `tenants` (los otros 4 endpoints cargan OK).
4. **Verificar**: la lista de propiedades se muestra.
5. **Verificar**: NO se queda en spinner infinito.

**Status:** ⏳ Pending

---

### AC-3: El usuario ve un mensaje de carga parcial

**Pasos:**

1. Con el block de `*/api/tenants` activo (test anterior), verificar:
2. **Verificar**: aparece un toast o banner: "Algunos datos no pudieron cargarse. Reintentá desde Configuración."
3. **Verificar**: el toast NO es bloqueante (la app se puede usar).

**Status:** ⏳ Pending

---

### AC-4: Helper `fetchWithTimeout` reusable

**Pasos:**

1. Verificar que `src/shared/lib/fetchWithTimeout.ts` existe.
2. **Verificar**: la función `fetchWithTimeout(url, options, timeoutMs)` usa `AbortController`.
3. **Verificar**: cuando el timeout expira, se llama `controller.abort()`.
4. **Verificar**: el `fetch` rechaza con un error de tipo `AbortError` o `TimeoutError`.

**Status:** ⏳ Pending

---

### AC-5: El timeout es configurable por llamada

**Pasos:**

1. DevTools → Sources → buscar `appStore.ts`.
2. **Verificar**: `apiCall` acepta un parámetro `timeoutMs` opcional con default 15000.
3. **Verificar**: en `hydrate()` se llama con default (sin parámetro) → 15s.
4. **Verificar**: hay al menos 1 llamada con `timeoutMs` distinto (out of scope: no hay todavía, pero la signature lo permite).

**Status:** ⏳ Pending

---

## Edge Cases

### EC-1: Todos los endpoints fallan (MySQL caído)

**Pasos:**

1. DevTools → Network → Offline.
2. Hard refresh.
3. **Esperado**: la app carga con todas las colecciones vacías en <20s.
4. **Esperado**: toast: "No se pudieron cargar los datos. Reitentá más tarde."
5. **Verificar**: la UI no crashea, no se queda en spinner infinito.

**Status:** ⏳ Pending

---

### EC-2: Un endpoint devuelve 500 (server error)

**Pasos:**

1. DevTools → Network → Block response del endpoint `/api/tenants` y devolver status 500.
2. Hard refresh.
3. **Esperado**: la app carga con los otros 4 endpoints OK, tenants vacío.
4. **Esperado**: toast warning.

**Status:** ⏳ Pending

---

### EC-3: El browser pierde conexión durante el hydrate

**Pasos:**

1. Hard refresh. Inmediatamente después, DevTools → Network → Offline.
2. **Esperado**: la app carga (con datos parciales) en <20s.
3. **Esperado**: toast warning.

**Status:** ⏳ Pending

---

### EC-4: El user navega a otra vista durante el hydrate

**Pasos:**

1. Hard refresh. Antes de que termine el hydrate, navegar a otra vista (ej. Tenants).
2. **Esperado**: la navegación funciona (no se queda esperando el hydrate).
3. **Esperado**: cuando el hydrate termina, el state se actualiza, y la próxima vez que se monte la vista, los datos están.

**Status:** ⏳ Pending

---

### EC-5: Rehidrate manual

**Pasos:**

1. Si hay un botón "Reintentar" en la UI, click.
2. **Verificar**: el hydrate anterior se cancela (si está en flight) y comienza uno nuevo.
3. **Verificar**: la app muestra los datos actualizados.
4. **Verificar**: si el reintento es exitoso, toast: "Datos recargados correctamente."

**Status:** ⏳ Pending

---

## Resumen

| Tipo                | Cantidad        |
| ------------------- | --------------- |
| Pre-checks          | 1 (PRE-1)       |
| Acceptance Criteria | 5 (AC-1 a AC-5) |
| Edge Cases          | 5 (EC-1 a EC-5) |
| **Total checks**    | **11**          |

---

## Aprobación

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]
