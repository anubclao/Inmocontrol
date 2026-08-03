# Fix: properties.ts creación de carpetas Drive sin withTimeout (BUG-016)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-016-properties-drive-timeout.md`.
>
> **Bug origen**: BUG-016 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/properties.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando creo una propiedad con Drive conectado, las 4 llamadas a Drive API (`files.list` × 2, `files.create` × 2) tengan timeout de 15s,
**So that** si Drive se cuelga, la creación de la propiedad no quede colgada 5min esperando respuesta.

## 2. Contexto del bug

### Estado actual (`server/routes/properties.ts:205-240`)

```ts
const existing = await drive.files.list({...});  // ← SIN withTimeout
let folderId = existing.data.files?.[0]?.id;
if (!folderId) {
  const created = await drive.files.create({...});  // ← SIN withTimeout
  folderId = created.data.id!;
}

for (const sub of subs) {
  const subExisting = await drive.files.list({...});  // ← SIN withTimeout
  if (!subExisting.data.files?.length) {
    await drive.files.create({...});  // ← SIN withTimeout
  }
}
```

El archivo SÍ define `withTimeout` y lo usa en `tenants.ts` (upload docs,
upload photos). Pero en `createPropertyFolders` se olvidó de aplicarlo.
**Inconsistencia interna.**

## 3. Acceptance Criteria

### AC-1: Las 4 calls a Drive usan withTimeout

- Envolver `drive.files.list` (línea 207) con `withTimeout(..., 15_000, '...')`.
- Envolver `drive.files.create` (línea 215) con `withTimeout(..., 15_000, '...')`.
- Envolver `drive.files.list` (línea 230) con `withTimeout(..., 15_000, '...')`.
- Envolver `drive.files.create` (línea 236) con `withTimeout(..., 15_000, '...')`.

### AC-2: Constante centralizada

- Reemplazar el literal `15_000` con `GOOGLE_API_TIMEOUT_MS` importado de
  `server/lib/driveHelpers.ts` (nuevo, de BUG-009/015).

### AC-3: Comportamiento exitoso sin cambios

- Para Drive que responde en <15s, idéntico al actual.
- Latencia: 0ms.

### AC-4: Drive timeout

- Una de las 4 calls rechaza con "timeout after 15_000ms".
- El `try/catch` exterior (línea ~245) ya lo captura y loguea
  "[Drive] Error creando carpeta de propiedad".
- La creación de la propiedad SIGUE (la fila en MySQL se crea igual, solo
  no se crea la carpeta en Drive).
- Comportamiento: la propiedad existe con `drive_folder_id = NULL`.
- El user puede reintentar la creación de carpeta después (out of scope).

## 4. Edge Cases

### EC-1: Solo la 3ra call (subExisting) timeout

- Las 2 primeras (property folder) se crearon OK.
- La 3ra (sub "Propietario") cuelga.
- Catch exterior atrapa, log warn, sigue.
- La propiedad queda con `Propietario/` faltante en Drive.
- Edge case raro; no rompe nada.

### EC-2: Las 4 calls timeout

- Catch exterior atrapa, log warn, sigue.
- La propiedad se crea con `drive_folder_id = NULL`.
- UI muestra "sin carpeta en Drive" en la card de la propiedad.

### EC-3: Drive rate limit (429)

- `err.response.status === 429` no es capturado por `withTimeout` (solo timeouts).
- El error se propaga al catch exterior, que loguea warn.
- Mismo resultado que EC2: la propiedad se crea, carpeta no.

## 5. Technical Contract

### Antes (sin withTimeout)

```ts
const existing = await drive.files.list({...});           // 4 calls sin timeout
const created = await drive.files.create({...});
// ... loop ...
const subExisting = await drive.files.list({...});
await drive.files.create({...});
```

### Después (con withTimeout)

```ts
import { withTimeout, GOOGLE_API_TIMEOUT_MS } from "../driveHelpers";

const existing = await withTimeout(drive.files.list({...}), GOOGLE_API_TIMEOUT_MS, 'drive.files.list (property folder)');
const created = await withTimeout(drive.files.create({...}), GOOGLE_API_TIMEOUT_MS, 'drive.files.create (property folder)');
// ... loop ...
const subExisting = await withTimeout(drive.files.list({...}), GOOGLE_API_TIMEOUT_MS, 'drive.files.list (subfolder)');
await withTimeout(drive.files.create({...}), GOOGLE_API_TIMEOUT_MS, 'drive.files.create (subfolder)');
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                        | Tipo    | Copy exacto                                                                                   |
| ------------------------------ | ------- | --------------------------------------------------------------------------------------------- |
| Crear propiedad con Drive OK   | success | `Propiedad creada` (sin cambios)                                                              |
| Drive timeout al crear carpeta | warning | `Propiedad creada, pero no se pudo crear la carpeta en Drive. Reintentá desde Configuración.` |

## 7. Out of Scope

- Reintentar la creación de carpeta automáticamente desde el cliente.
- Crear carpetas en background (queue + cron). Hoy se hace sincrónico.

## 8. Dependencias

- `server/lib/driveHelpers.ts` (nuevo, de BUG-009).
- `properties.ts:205-240` modificado.

## 9. Effort

- 4 cambios `withTimeout`: 10 min.
- Test manual: 5 min.
- **Total: 15 min**

---

**Pendiente de aprobación del usuario.**
