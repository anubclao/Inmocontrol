# Fix: TenantsView handleDocUpload sin AbortController (BUG-022)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-022-tenant-doc-upload-timeout.md`.
>
> **Bug origen**: BUG-022 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `src/features/tenants/TenantsView.tsx`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando subo un documento de un inquilino (cédula, contrato, recibo), la operación tenga timeout de 30s (no 5min del browser),
**So that** si Drive está lento, el botón "Subir" no quede colgado eternamente y pueda reintentar.

## 2. Contexto del bug

### Estado actual (`TenantsView.tsx:513-540`)

```ts
const handleDocUpload = async (e, folder, tenant) => {
  // ... validaciones ...
  const res = await fetch('/api/tenants/upload-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ... }),
  });
  // ← sin AbortController, sin timeout
  // Si Drive cuelga, el fetch espera 5min (browser proxy timeout)
};
```

### Comparación con `handleConfirmAndCreate` (línea 426-446)

Ese SÍ tiene timeout (probablemente). BUG-022 es la inconsistencia.

## 3. Acceptance Criteria

### AC-1: Usar `fetchWithTimeout` helper

- Importar `fetchWithTimeout` de `src/shared/lib/fetchWithTimeout.ts` (nuevo de BUG-019).
- Reemplazar `fetch(...)` por `fetchWithTimeout(url, options, 30_000)`:
  ```ts
  const res = await fetchWithTimeout('/api/tenants/upload-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ... }),
  }, 30_000);  // 30s para uploads (más generoso que el default 15s)
  ```

### AC-2: 30s para uploads, 15s para el resto

- `fetchWithTimeout` acepta `timeoutMs`. Default 15s.
- Para uploads de archivos (más lentos), usar 30s.
- Para queries de datos, dejar 15s.

### AC-3: Cancelar el fetch si el componente se desmonta

- En el `useEffect` cleanup del componente (o via `AbortController` local):
  ```ts
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const handleDocUpload = async (e, folder, tenant) => {
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetchWithTimeout(..., 30_000, abortControllerRef.current.signal);
    } catch (err) {
      if (err.name === 'AbortError') return; // componente desmontado
      // ...
    }
  };
  
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);
  ```

### AC-4: Toast de timeout claro

- Si el fetch tira `TimeoutError` (o `AbortError` por timeout):
  ```ts
  showToast('La subida tardó más de 30s. Reintentá.', 'error');
  setUploadStatus(...);
  ```

## 4. Edge Cases

### EC-1: Drive responde en 5s (caso normal)

- Timeout nunca dispara. 200 OK. Comportamiento idéntico al actual.

### EC-2: Drive responde en 31s (caso lento)

- `fetchWithTimeout` aborta a los 30s.
- Promise rechaza con `TimeoutError`.
- Toast: "La subida tardó más de 30s. Reintentá."
- El state de upload se resetea (uploading=false).

### EC-3: User navega a otra vista durante el upload

- Componente se desmonta.
- `useEffect` cleanup dispara `abortController.abort()`.
- El fetch en flight se cancela.
- Promise rechaza con `AbortError`.
- El catch lo ignora (`if (err.name === 'AbortError') return`).

### EC-4: User hace click en "Subir" 2 veces seguidas (rápido)

- El `fileInput.value = ''` (línea ~588) resetea el input → el 2do click
  no se dispara porque el state del input no cambió.
- Comportamiento idéntico al actual.

## 5. Technical Contract

### Antes (sin timeout)

```ts
const res = await fetch('/api/tenants/upload-document', {...});
```

### Después (con timeout + abort)

```ts
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

const controller = new AbortController();
abortControllerRef.current = controller;
try {
  const res = await fetchWithTimeout(
    '/api/tenants/upload-document',
    { method: 'POST', headers: {...}, body: JSON.stringify({...}), signal: controller.signal },
    30_000,
  );
  // ... resto ...
} catch (err: any) {
  if (err.name === 'AbortError') return;
  if (err.name === 'TimeoutError') {
    showToast('La subida tardó más de 30s. Reintentá.', 'error');
  } else {
    showToast('Error de conexión al subir documento', 'error');
  }
}
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| Upload OK | success | `Documento subido a ${folder}/ en Google Drive` (sin cambios) |
| Upload timeout (30s) | error | `La subida tardó más de 30s. Reintentá.` |
| Upload error genérico | error | `Error de conexión al subir documento` (sin cambios) |
| Upload cancelado (navegó a otra vista) | (ninguno) | (sin toast, silencioso) |

## 7. Out of Scope

- Progress bar del upload (no tenemos el API de fetch streaming).
- Reintento automático.

## 8. Dependencias

- `src/shared/lib/fetchWithTimeout.ts` (nuevo, de BUG-019).
- `TenantsView.tsx:513-540` modificado.

## 9. Effort

- Wrap con `fetchWithTimeout` + AbortController: 15 min.
- Test manual: 15 min.
- **Total: 30 min**

---

**Pendiente de aprobación del usuario.**
