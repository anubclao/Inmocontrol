# Fix: driveService.ts sin AbortController ni timeouts (BUG-024)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-024-drive-service-timeout.md`.
>
> **Bug origen**: BUG-024 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `src/lib/drive/driveService.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que las 3 funciones de driveService (`createPropertyFolders`, `uploadFileToDrive`, `uploadPdfToDrive`) tengan timeout de 30s para uploads / 15s para queries,
**So that** si Drive está lento, el botón "Subir" no quede colgado 5min y pueda reintentar.

## 2. Contexto del bug

### Estado actual

```ts
export async function createPropertyFolders(...) {
  const res = await fetch(`${API}/create-property-folders?...`);  // sin timeout
  // ...
}

export async function uploadFileToDrive(...) {
  const res = await fetch(`${API}/upload-file`, {...});  // sin timeout
  // ...
}

export async function uploadPdfToDrive(...) {
  const res = await fetch(`${API}/upload-pdf`, {...});  // sin timeout
  // ...
}
```

Las 3 funciones usan `fetch` sin AbortController. Si el server o Drive cuelgan,
el cliente espera hasta 5min (browser proxy timeout).

## 3. Acceptance Criteria

### AC-1: Usar `fetchWithTimeout` (helper de BUG-019) en las 3 funciones

```ts
import { fetchWithTimeout, TimeoutError } from '../../shared/lib/fetchWithTimeout';

export async function createPropertyFolders(
  propertyId: string,
  propertyName: string,
  timeoutMs: number = 15_000,
): Promise<string | null> {
  const { connected } = useGoogleDriveStore.getState();
  if (!connected) return null;

  try {
    const res = await fetchWithTimeout(
      `${API}/create-property-folders?propertyId=${encodeURIComponent(propertyId)}&propertyName=${encodeURIComponent(propertyName)}`,
      {},
      timeoutMs,
    );
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.propertyFolderId;
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.warn('[Drive] createPropertyFolders timeout');
    } else {
      console.error('[Drive] Error creando carpetas:', err);
    }
    return null;
  }
}
```

### AC-2: Timeouts diferenciados

- `createPropertyFolders`: 15s (es solo metadata, rápido).
- `uploadFileToDrive`: 30s (PDF puede ser pesado).
- `uploadPdfToDrive`: 30s (idem).

### AC-3: Mensaje de error claro en timeout

- Si `TimeoutError`:
  ```ts
  return { error: 'Drive no respondió a tiempo. Reintentá.' };
  ```
- Si otro error (500, 401, etc.):
  ```ts
  return { error: err.message ?? 'Upload failed' };
  ```

### AC-4: Comportamiento exitoso sin cambios

- Para Drive que responde rápido, idéntico al actual.
- Latencia: 0ms (try/catch gratis).

## 4. Edge Cases

### EC-1: Drive responde en 5s

- Timeout nunca dispara. 200 OK. ✅

### EC-2: Drive responde en 31s (caso upload lento)

- `fetchWithTimeout` aborta a los 30s.
- Promise rechaza con `TimeoutError`.
- Función devuelve `{ error: 'Drive no respondió a tiempo. Reintentá.' }`.
- Caller (UI) muestra el error.

### EC-3: Drive desconectado

- Early-return antes del fetch. Idéntico al actual.

### EC-4: Network error (offline)

- `fetch` tira `TypeError: Failed to fetch`.
- Catch genérico → log + return error.

## 5. Technical Contract

### Antes (sin timeout)

```ts
const res = await fetch(`${API}/create-property-folders?...`);
```

### Después (con timeout)

```ts
const res = await fetchWithTimeout(`${API}/create-property-folders?...`, {}, 15_000);
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| Upload OK | success | (depende del caller, sin cambios) |
| Upload timeout | error | `Drive no respondió a tiempo. Reintentá.` |
| Upload error genérico | error | `${err.message}` (sin cambios) |

## 7. Out of Scope

- Reintento automático.
- Progress bar.
- Cancelar uploads en curso desde la UI.

## 8. Dependencias

- `src/shared/lib/fetchWithTimeout.ts` (de BUG-019).
- `driveService.ts` 3 funciones modificadas.

## 9. Effort

- 3 funciones × 10 min: 30 min.
- Test manual: 15 min.
- **Total: 45 min**

---

**Pendiente de aprobación del usuario.**
