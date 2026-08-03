# Fix: Memory leak URL.createObjectURL sin revokeObjectURL (BUG-021)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-021-blob-url-revoke.md`.
>
> **Bug origen**: BUG-021 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `src/features/properties/PropertiesView.tsx`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando el wizard de propiedad crea blob URLs (caso "Drive no conectado"), esas URLs se liberen cuando el wizard se cierra o se cambia el documento,
**So that** después de 30 minutos de uso intensivo, mi browser no esté usando 500MB+ de RAM en blobs zombies.

## 2. Contexto del bug

### Estado actual

`PropertiesView.tsx` crea blob URLs en:

- Línea 552: `mandateUrl = URL.createObjectURL(file)` (mandato PDF)
- Línea 622: `docUrl = URL.createObjectURL(file)` (doc general)
- Líneas 719, 726, 733: `blobUrl = URL.createObjectURL(file)` (wizard docs)

`revokeObjectURL` solo se llama en:

- Líneas 1435, 1489, 1797: cleanup de `uploadedDocs` array (wizard)
- Líneas 2891, 2907: al cerrar el modal `viewingDoc`

### Problema concreto

1. **mandateUrl (línea 552)**: blob creado, se mete en `properties.mandatePdfUrl`.
   - Cuando se cierra el wizard, NO se revoca.
   - Si el user sube 10 PDFs de mandato en la sesión, quedan 10 blobs en RAM.
2. **docUrl (línea 622)**: idem, en `properties.documents`.
3. **wizard blobUrls (líneas 719, 726, 733)**: las que están dentro de `uploadedDocs` SÍ se revocan (línea 1435) PERO solo al desmontar el wizard completo. Si el user cierra el browser a mitad del wizard, NO se revocan.

## 3. Acceptance Criteria

### AC-1: Cleanup de `mandateUrl` y `docUrl` en cleanup del wizard

- En el `useEffect` cleanup del wizard (donde ya se revocan `uploadedDocs`),
  agregar también la revocación del mandate actual:
  ```ts
  useEffect(() => {
    return () => {
      // Cleanup existente
      Object.values(uploadedDocs)
        .flat()
        .forEach((u) => {
          if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
        });
      // FIX BUG-021: revocar también el mandateUrl si es blob
      if (mandateUrl?.startsWith("blob:")) URL.revokeObjectURL(mandateUrl);
    };
  }, [uploadedDocs, mandateUrl]);
  ```

### AC-2: Cleanup de `docUrl` (caso upload de doc general)

- Mismo patrón: si `docUrl` es un blob URL, revocarlo al cerrar el wizard.

### AC-3: Helper `revokeIfBlob(url)` reutilizable

- Crear en `src/shared/lib/blob.ts`:
  ```ts
  export function revokeIfBlob(url: string | null | undefined): void {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }
  ```
- Usar en TODOS los cleanup points.

### AC-4: Reemplazo de doc también revoca el viejo

- Si el user sube un nuevo PDF al mismo slot, el viejo blob URL debe revocarse
  antes de pisar el state:
  ```ts
  const handleUpload = (slot: string, file: File) => {
    // Revocar blob previo si existe
    const oldUrl = uploadedDocs[slot]?.[0];
    revokeIfBlob(oldUrl);
    // Crear el nuevo
    const newUrl = URL.createObjectURL(file);
    setUploadedDocs({ ...uploadedDocs, [slot]: [newUrl] });
  };
  ```

## 4. Edge Cases

### EC-1: El user sube el mismo archivo 2 veces (mismo File object)

- El segundo `createObjectURL` genera OTRO blob URL distinto.
- El primero debe revocarse antes de pisar.

### EC-2: El user cierra el browser sin hacer cleanup

- El browser libera TODOS los blob URLs al cerrar la pestaña.
- No es leak persistente.
- ✅ OK.

### EC-3: Drive está conectado y devuelve `webViewLink` (https://...)

- `webViewLink.startsWith('blob:')` es `false`.
- `revokeIfBlob` no hace nada.
- ✅ OK.

### EC-4: `mandateUrl` se reemplaza múltiples veces durante el wizard

- Cada vez que se sube un nuevo PDF, se crea un nuevo blob URL.
- Sin cleanup explícito, todos los anteriores quedan en RAM.
- AC-1 + AC-4 cubren este caso.

## 5. Technical Contract

### Antes (sin cleanup)

```ts
const handleSubmit = async () => {
  // ... crear mandateUrl como blob ...
  setProperties([...properties, { ..., mandatePdfUrl: mandateUrl }]);
  // mandateUrl queda en RAM como blob URL vivo
};
```

### Después (con cleanup)

```ts
useEffect(() => {
  return () => {
    revokeIfBlob(mandateUrl);
    Object.values(uploadedDocs).flat().forEach(revokeIfBlob);
  };
}, [mandateUrl, uploadedDocs]);
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger         | Tipo      | Copy exacto                          |
| --------------- | --------- | ------------------------------------ |
| Cualquier flujo | (ninguno) | (sin cambios de UX — fix silencioso) |

(No hay UX changes — el fix es 100% cleanup de memoria.)

## 7. Out of Scope

- Migrar de blob URLs a `FileSystemFileHandle` (API moderna). Out of scope.
- Medir el uso de RAM con `performance.memory`. Out of scope.

## 8. Dependencias

- `src/shared/lib/blob.ts` (nuevo, ~10 líneas, 0 deps).
- `PropertiesView.tsx` líneas 552, 622, 719-733 + cleanup useEffect.

## 9. Effort

- Helper `revokeIfBlob`: 5 min.
- Cleanup en wizard useEffect: 10 min.
- Cleanup al reemplazar doc: 10 min.
- Test manual: 10 min.
- **Total: 30 min**

---

**Pendiente de aprobación del usuario.**
