# Fix: hydrate() de appStore sin timeouts (BUG-019)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-019-hydrate-timeouts.md`.
>
> **Bug origen**: BUG-019 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media (UX de carga inicial).
> **Stack afectado**: `src/shared/store/appStore.ts`.

## 1. User Story

**As a** usuario de InmoControl,
**I want to** que la app termine de cargar en menos de 20 segundos aunque algún endpoint de hidratación se cuelgue,
**So that** si Drive está lento, MySQL saturado, o cualquier endpoint individual se cuelga, los otros 4 endpoints del hydrate() puedan terminar y la app se vuelva usable (al menos con datos parciales).

## 2. Contexto del bug

### Estado actual (roto)

`src/shared/store/appStore.ts:75-95`:

```ts
const [propsRes, tenantsRes, finRes, contractsRes, amortRes] =
  await Promise.all([
    apiCall("GET", "/api/properties"),
    apiCall("GET", "/api/tenants"),
    apiCall("GET", "/api/financial-records"),
    apiCall("GET", "/api/entities/contracts"),
    apiCall("GET", "/api/billing/amortization"),
  ]);
```

### Resultado

`Promise.all` espera a **TODAS** las promises. Si UNO solo de los 5 endpoints cuelga (Drive timeout, MySQL saturado, red caída), la app queda con el spinner de carga **para siempre**. El usuario no puede interactuar.

`apiCall` tampoco tiene AbortController — un fetch colgado espera para siempre (excepto por el timeout del browser, que es muy largo, ~5min).

## 3. Acceptance Criteria

### AC-1: Cada endpoint individual tiene timeout 15s

- Cada `apiCall` se envuelve con un `Promise.race([apiCall, timeout(15_000)])`.
- Si el endpoint tarda >15s, la promise se aborta con un error específico (`TimeoutError`).
- El `fetch` subyacente se cancela vía `AbortController` (no queda colgado en red).

### AC-2: hydrate() continúa aunque un endpoint falle

- Cambiar `Promise.all` por `Promise.allSettled` (o equivalente).
- Si un endpoint falla (timeout, 500, 404), los otros 4 siguen y la app carga con datos parciales.
- Para cada endpoint fallido, se loguea un warning con el motivo (no error en consola, no rompe la app).
- El state final tiene los datos disponibles; los faltantes quedan como `[]`.

### AC-3: El usuario ve un mensaje de carga parcial

- Si al menos 1 endpoint falló en el hydrate, se muestra un toast o banner: "Algunos datos no pudieron cargarse. Reintentá desde Configuración."
- **No es bloqueante** — la app sigue funcionando con los datos que SÍ cargaron.

### AC-4: Helper `fetchWithTimeout` reusable

- Crear `src/shared/lib/fetchWithTimeout.ts` que envuelve `fetch` con `AbortController` + timeout.
- Reutilizar en otros lugares (driveService, billing/api, etc.) en fixes futuros (out of scope de este fix).
- Para este fix, solo se usa en `appStore.hydrate()`.

```typescript
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### AC-5: El timeout es configurable por llamada

- `apiCall` acepta un parámetro opcional `timeoutMs` (default 15000).
- Esto permite timeouts más largos para operaciones lentas (ej. upload de PDF) en el futuro.

## 4. Edge Cases

### EC-1: Todos los endpoints fallan (MySQL caído)

- **Esperado**: la app carga con `properties=[], tenants=[], ...`. Toast: "No se pudieron cargar los datos. Reintentá más tarde."
- No se queda en spinner infinito.

### EC-2: Un endpoint devuelve 500 (server error)

- `apiCall` rechaza con el error.
- `Promise.allSettled` lo marca como `rejected`.
- El state de Zustand se actualiza con los arrays vacíos para esa colección.
- Toast: "Algunos datos no pudieron cargarse."

### EC-3: El browser pierde conexión durante el hydrate

- `fetch` tira `TypeError: Failed to fetch`.
- `Promise.allSettled` lo maneja.
- Mismo resultado que EC-2.

### EC-4: El user navega a otra vista durante el hydrate

- El hydrate sigue corriendo en background.
- Cuando termina (éxito o fallo), actualiza el state.
- La vista actual puede no mostrar los datos nuevos si ya se montó, pero la próxima vez que se monte, los tendrá.

### EC-5: El user rehidrata manualmente (botón "Reintentar")

- Hidrate cancela el anterior si está en flight (AbortController).
- Comienza uno nuevo con los 5 endpoints.
- El toast se actualiza con el nuevo resultado.

## 5. Technical Contract

### Antes (`src/shared/store/appStore.ts:75-95`)

```ts
const [propsRes, tenantsRes, finRes, contractsRes, amortRes] =
  await Promise.all([
    apiCall("GET", "/api/properties"),
    apiCall("GET", "/api/tenants"),
    apiCall("GET", "/api/financial-records"),
    apiCall("GET", "/api/entities/contracts"),
    apiCall("GET", "/api/billing/amortization"),
  ]);
```

### Después

```ts
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

const results = await Promise.allSettled([
  apiCall("GET", "/api/properties"),
  apiCall("GET", "/api/tenants"),
  apiCall("GET", "/api/financial-records"),
  apiCall("GET", "/api/entities/contracts"),
  apiCall("GET", "/api/billing/amortization"),
]);

const [propsRes, tenantsRes, finRes, contractsRes, amortRes] = results.map(
  (r) => (r.status === "fulfilled" ? r.value : null),
);

const failedCount = results.filter((r) => r.status === "rejected").length;
if (failedCount > 0) {
  console.warn(`[hydrate] ${failedCount}/5 endpoints failed`);
  // Mostrar toast global (setear un flag en el state)
  set({ hydrationPartial: true });
}
```

### `apiCall` con timeout

```ts
// src/shared/store/appStore.ts
async function apiCall(
  method: string,
  path: string,
  body?: any,
  timeoutMs: number = 15_000,
): Promise<any> {
  const res = await fetchWithTimeout(
    path.startsWith("http") ? path : `${API_BASE}${path}`,
    {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    },
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  return res.json();
}
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                          | Tipo    | Copy exacto                                                          |
| -------------------------------- | ------- | -------------------------------------------------------------------- |
| 1+ endpoints fallaron en hydrate | warning | `Algunos datos no pudieron cargarse. Reintentá desde Configuración.` |
| 5/5 endpoints fallaron           | error   | `No se pudieron cargar los datos. Reintentá más tarde.`              |
| Rehidrate manual exitoso         | success | `Datos recargados correctamente.`                                    |

## 7. Out of Scope

- **Aplicar `fetchWithTimeout` a otros lugares** (driveService, billing/api). Solo se crea el helper; el resto se migra en fixes futuros.
- **Rehidrate automático en background** (ej. cada 5 min). Out of scope.
- **Mostrar un spinner de rehidrate** cuando el user hace click en "Reintentar". Out of scope.
- **Tests automatizados con Vitest**. Verifier E2E manual.
- **Reestructurar `appStore` para evitar el monolito**. El refactor completo es otro spec.

## 8. Dependencias

### Archivos nuevos

- `src/shared/lib/fetchWithTimeout.ts` (15 líneas)

### Archivos a modificar

- `src/shared/store/appStore.ts` (helper `apiCall` + `hydrate()`)

### Archivos a NO tocar

- `src/shared/store/types.ts` (no se cambia)
- Otros stores (googleDriveStore, settingsStore, etc.)
- `src/lib/drive/driveService.ts` (out of scope de este fix, usa el helper en fix futuro)
- `src/features/billing/api.ts` (out of scope, idem)

## 9. Riesgos identificados

- **Datos parciales en la UI**: la app muestra datos viejos o vacíos. Mitigación: el toast avisa, y el state se llena con arrays vacíos (no undefined) para que la UI no rompa.
- **Doble hydrate**: si el user hace click 2 veces en "Reintentar", se disparan 2 hydrates en paralelo. Mitigación: usar un `AbortController` compartido y cancelarlo al iniciar uno nuevo.
- **Performance**: el helper `fetchWithTimeout` agrega 1 `setTimeout` por request. Impacto negligible.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03
