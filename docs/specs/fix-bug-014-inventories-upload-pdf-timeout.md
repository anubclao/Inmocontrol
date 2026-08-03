# Fix: Inventories upload-pdf sin try/catch en Drive (BUG-014)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-014-inventories-upload-pdf-timeout.md`.
>
> **Bug origen**: BUG-014 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/inventories.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que si Google Drive se cuelga mientras subo el PDF de un inventario, el server devuelva JSON 500 (o 503) con mensaje accionable, en vez de HTML 500 que rompe el cliente,
**So that** el frontend pueda mostrar "Drive no responde, reintentá" en vez de tirar `SyntaxError`.

## 2. Contexto del bug

### Estado actual (`server/routes/inventories.ts:285-374`)

```ts
router.post("/upload-pdf", async (req, res) => {
  // ... validaciones ...
  let drive: any = null;
  try { drive = await getFreshDriveClient(); } catch {}
  if (!drive) { res.status(401).json({...}); return; }

  // 1. Buscar la carpeta
  const [propRows] = await pool.query<any[]>(...);
  // ↑ SIN try/catch

  // 2. Buscar/crear subcarpeta
  const inventariosFolderId = await getOrCreateSubfolder(drive, ...);
  // ↑ getOrCreateSubfolder YA tiene withTimeout pero no try/catch
  // ↑ Si drive.files.list tira (no timeout), el error se propaga sin manejar

  // 3-4. Upload + permissions
  const uploaded = await drive.files.create({...});  // ↑ SIN try/catch
  await drive.permissions.create({...});             // ↑ SIN try/catch

  // 5. UPDATE
  await pool.query(`UPDATE properties SET ${urlField} = ? ...`);  // ↑ SIN try/catch
  res.json({...});
});
```

### Resultado

Si CUALQUIER llamada a Drive o al pool falla:

- Express agarra con default handler → HTML 500 stacktrace.
- Frontend tira `SyntaxError`.
- PDF no se sube, propiedad no se actualiza, user ve spinner eterno.

## 3. Acceptance Criteria

### AC-1: try/catch general en el handler

- Envolver todo el cuerpo del handler (después de las validaciones) en
  un `try { ... } catch (err) { ... }`.
- En el catch:

  ```ts
  catch (err: any) {
    console.error("[upload-pdf] failed:", err);

    // Errores específicos de Drive (timeout, 5xx)
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' ||
        err.message?.includes('timeout')) {
      return res.status(503).json({
        error: "Drive no responde. Reintentá en unos segundos.",
        retryable: true,
      });
    }

    // Errores de Drive API
    if (err.response?.status === 429) {
      return res.status(429).json({
        error: "Drive está saturado. Reintentá en 1 minuto.",
        retryable: true,
      });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({
        error: "Sin permisos para escribir en Drive. Reconectá.",
        hint: "Andá a Configuración → Google Drive → Reconectar.",
      });
    }

    // Default
    return res.status(500).json({ error: err?.message ?? "Error subiendo PDF" });
  }
  ```

### AC-2: Migrar a `asyncHandler` (consistencia con BUG-029)

- Reemplazar el patrón manual `try/catch` + `res.status().json()` con
  `asyncHandler` + propagación al `errorHandler` central.
- Aplica también a la response de éxito: `res.json({...})` se mantiene igual.

```ts
router.post(
  "/upload-pdf",
  asyncHandler(async (req, res) => {
    // ... validaciones (devuelven res.status().json() directo, está OK) ...
    // ... resto del handler ...
  }),
);
```

### AC-3: `withTimeout` consistente con tenants.ts y properties.ts

- Envolver las 3 llamadas a Drive (`drive.files.create`, `drive.permissions.create`,
  `getOrCreateSubfolder`) con `withTimeout` (15s default).
- Si pasan 15s → cancelar y responder 503.

### AC-4: Comportamiento exitoso sin cambios

- Para PDFs que se suben bien, response idéntico al actual.
- Latencia adicional: 0ms (try/catch es gratis en happy path).

## 4. Edge Cases

### EC-1: Drive no conectado

- `getFreshDriveClient()` lanza → `drive = null` → 401 con mensaje claro.
- Comportamiento idéntico al actual.

### EC-2: Drive conectado pero 5xx en `drive.files.create`

- `err.response.status === 500` → catch genérico → 500 JSON con mensaje.
- User reintenta, segunda vez suele funcionar.

### EC-3: Drive rate limit (429)

- Catch específico → 429 con `retryable: true`.
- UI puede hacer backoff exponencial (out of scope de este fix).

### EC-4: PDF muy grande (>10MB)

- Buffer.from() tarda, `drive.files.create` tarda más.
- Si tarda >15s → 503 con `retryable: true`.
- Edge case: el PDF del inventario no debería pasar 2-3 MB normalmente.

### EC-5: UPDATE de `properties` falla (schema drift, FK violation)

- Catch genérico → 500 JSON.
- El PDF YA está en Drive (subido antes), pero la URL no se guardó.
- Out of scope de este fix: lógica de cleanup/cleanup-rollback del PDF en Drive.

## 5. Technical Contract

### Antes (sin protección)

```
POST /api/inventories/upload-pdf
  → getFreshDriveClient()         (try/catch: ✓)
  → pool.query (SELECT)            (try/catch: ✗)
  → getOrCreateSubfolder (Drive)   (withTimeout: ✓, try/catch: ✗)
  → drive.files.create (PDF)       (try/catch: ✗)
  → drive.permissions.create       (try/catch: ✗)
  → pool.query (UPDATE)            (try/catch: ✗)
  → res.json({success: true})
```

### Después (protegido)

```
POST /api/inventories/upload-pdf
  → getFreshDriveClient()         (try/catch: ✓)
  → pool.query (SELECT)            (try/catch: ✓ via asyncHandler)
  → withTimeout(getOrCreateSubfolder) (try/catch: ✓)
  → withTimeout(drive.files.create)  (try/catch: ✓)
  → withTimeout(drive.permissions.create) (try/catch: ✓)
  → pool.query (UPDATE)            (try/catch: ✓ via asyncHandler)
  → res.json({success: true})
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                  | Tipo  | Copy exacto                                                           |
| ------------------------ | ----- | --------------------------------------------------------------------- |
| Drive timeout (15s)      | error | `Drive no responde. Reintentá en unos segundos.`                      |
| Drive rate limit (429)   | error | `Drive está saturado. Reintentá en 1 minuto.`                         |
| Drive sin permisos (403) | error | `Sin permisos para escribir en Drive. Reconectá desde Configuración.` |
| Error genérico           | error | `Error subiendo PDF: ${err.message}`                                  |

## 7. Out of Scope

- Lógica de rollback (borrar el PDF de Drive si el UPDATE falla).
- Reintento automático del cliente.
- Reducir el tamaño del PDF antes de subir.

## 8. Dependencias

- `server/lib/asyncHandler.ts` (ya existe de BUG-029).
- `server/lib/withTimeout.ts` (ya existe en `tenants.ts` y `properties.ts`).
- `inventories.ts:285-374` modificado.

## 9. Effort

- Migrar a asyncHandler: 15 min.
- Agregar withTimeout en 3 calls: 15 min.
- Catch específico para 429/403/timeout: 20 min.
- Test manual: 20 min.
- **Total: 1h**

---

**Pendiente de aprobación del usuario.**
