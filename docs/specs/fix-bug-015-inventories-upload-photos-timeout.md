# Fix: Inventories upload-photos sin withTimeout (BUG-015)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-015-inventories-upload-photos-timeout.md`.
>
> **Bug origen**: BUG-015 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/inventories.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que si una foto del inventario se queda colgada en Drive (timeout >15s), la app no se quede esperando — se registra en `failed` y el resto de fotos sigue,
**So that** la subida de N fotos no quede bloqueada por UNA foto problemática.

## 2. Contexto del bug

### Estado actual (`server/routes/inventories.ts:213-281`)

```ts
for (const photo of photos) {
  try {
    // ... validación ...
    const result = await drive.files.create({...});      // ← SIN withTimeout
    await drive.permissions.create({...});                // ← SIN withTimeout
    uploaded.push({...});
  } catch (err) {
    failed.push({ name: photo.name, error: ... });
  }
}
```

El loop ya tiene try/catch por foto, lo cual es BUENO (si una falla, el resto sigue).
PERO las llamadas a Drive no tienen `withTimeout`. Si Drive se cuelga, `drive.files.create` puede quedar esperando 5min (timeout del browser proxy).

### Comparación con `tenants.ts` y `properties.ts`

Ambos usan `withTimeout(pool.query, GOOGLE_API_TIMEOUT_MS, label)` para envolver
TODAS las llamadas a Drive API. Inventories quedó inconsistente.

## 3. Acceptance Criteria

### AC-1: Envolver las 2 calls de Drive con `withTimeout`

```ts
import { withTimeout, GOOGLE_API_TIMEOUT_MS } from "../driveHelpers";

for (const photo of photos) {
  try {
    // ... validación ...

    const result = await withTimeout(
      drive.files.create({
        requestBody: { name: photo.name, parents: [photosFolderId] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: "id, webViewLink",
      }),
      GOOGLE_API_TIMEOUT_MS,
      `drive.files.create (photo ${photo.name})`,
    );

    await withTimeout(
      drive.permissions.create({
        fileId: result.data.id!,
        requestBody: { role: "reader", type: "anyone" },
      }),
      GOOGLE_API_TIMEOUT_MS,
      `drive.permissions.create (photo ${photo.name})`,
    );

    uploaded.push({...});
  } catch (err: any) {
    failed.push({ name: photo.name, error: err?.message ?? "timeout or error" });
  }
}
```

### AC-2: Helper `GOOGLE_API_TIMEOUT_MS` exportado

- Hoy está como constante local en `tenants.ts` y `properties.ts`.
- Mover a `server/lib/driveHelpers.ts` (que también recibe los helpers de BUG-009 y BUG-010).
- Valor: 15_000 ms (consistente).

### AC-3: Comportamiento exitoso sin cambios

- Para fotos que suben en <15s, response idéntico al actual.
- Latencia adicional: 0ms (try/catch + setTimeout son baratos).

### AC-4: Foto que cuelga

- Tras 15s, `withTimeout` rechaza con error "timeout".
- Se pushea a `failed` con `error: "timeout or error"`.
- El loop sigue con la próxima foto.
- Response: `{success: false, uploaded: [...N-1], failed: [{...}]}`.

## 4. Edge Cases

### EC-1: TODAS las fotos cuelgan

- `uploaded = []`, `failed = [...N]`.
- `success = false` (por `failed.length > 0`).
- UI muestra "N fotos no se pudieron subir, reintentá".

### EC-2: Solo `drive.files.create` cuelga (permissions OK)

- La 1ra call rechaza con timeout, va a `failed`.
- Loop sigue con la próxima foto.

### EC-3: `drive.files.create` OK pero `permissions.create` cuelga

- La foto está en Drive pero sin permisos "reader/anyone".
- Se pushea a `failed` con error de permissions.
- `uploaded` no la incluye.
- Caso edge: la foto queda en Drive sin acceso. Out of scope: cleanup.

### EC-4: Drive devuelve 429 en alguna foto

- `withTimeout` no captura HTTP errors de Drive API, solo timeouts.
- El error de Drive (`err.response.status === 429`) cae al catch genérico.
- Se pushea a `failed` con `error: "Rate limit"`.
- Loop sigue.

## 5. Technical Contract

### Antes (sin withTimeout)

```
POST /api/inventories/upload-photos { propertyId, phase, photos: [10 items] }
  → for each photo:
       → drive.files.create    (sin timeout, puede colgar 5min)
       → drive.permissions.create (sin timeout, puede colgar 5min)
       → uploaded.push OR failed.push
  → res.json({success, uploaded, failed})
```

### Después (con withTimeout)

```
POST /api/inventories/upload-photos { propertyId, phase, photos: [10 items] }
  → for each photo:
       → withTimeout(drive.files.create, 15s)
       → withTimeout(drive.permissions.create, 15s)
       → uploaded.push OR failed.push (timeout message)
  → res.json({success, uploaded, failed})
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                 | Tipo    | Copy exacto                                                 |
| ----------------------- | ------- | ----------------------------------------------------------- |
| 1 foto timeout          | warning | `1 foto no se pudo subir a Drive. La podés reintentar.`     |
| N fotos timeout         | warning | `N fotos no se pudieron subir. Reintentá.`                  |
| Todas las fotos timeout | error   | `No se pudo subir ninguna foto. Reintentá en unos minutos.` |

## 7. Out of Scope

- Cleanup de fotos en Drive que quedaron sin permisos (subidas pero sin `permissions.create`).
- Reintento automático de fotos fallidas desde el cliente.
- Subida en paralelo (concurrente) — hoy es secuencial, suficiente para N=10.

## 8. Dependencias

- `server/lib/withTimeout.ts` (ya existe en otros archivos).
- `server/lib/driveHelpers.ts` (nuevo de BUG-009, exporta `GOOGLE_API_TIMEOUT_MS`).
- `inventories.ts:213-281` modificado.

## 9. Effort

- Mover `GOOGLE_API_TIMEOUT_MS` a `driveHelpers.ts`: 10 min.
- Envolver 2 calls con `withTimeout`: 10 min.
- Test manual con DevTools throttling: 15 min.
- **Total: 30 min**

---

**Pendiente de aprobación del usuario.**
