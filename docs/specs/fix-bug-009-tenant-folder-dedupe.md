# Fix: doble-click en "Crear tenant" puede duplicar carpeta Drive (BUG-009)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-009-tenant-folder-dedupe.md`.
>
> **Bug origen**: BUG-009 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `server/routes/tenants.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que si hago doble-click en "Crear tenant", solo se cree UNA carpeta en Drive para el inquilino (no dos),
**So that** mi Drive no se llene de carpetas duplicadas con el mismo nombre.

## 2. Contexto del bug

### Patrón actual (en `server/routes/tenants.ts:140-181`)

```ts
// 1a. Si no hay carpeta del inmueble, crearla  ← YA TIENE chequeo de existencia
if (!propertyDriveFolderId && propertyAddress) {
  const existing = await drive.files.list({
    q: `name='${address}' and mimeType='folder' and '${rootFolderId}' in parents and trashed=false`,
  });
  let propertyFolderId = existing.data.files?.[0]?.id;
  if (!propertyFolderId) {
    // ... create
  }
}

// 1b. Crear carpeta del arrendatario  ← NO TIENE chequeo de existencia
if (propertyDriveFolderId) {
  const folderName = `${name} (${idNumber})`;
  const folderRes = await drive.files.create({
    requestBody: { name: folderName, parents: [propertyDriveFolderId] },
    fields: "id",
  });
  tenantDriveFolderId = folderRes.data.id!; // ← siempre crea, sin chequear
}
```

### Resultado

Doble-click en "Crear tenant" (UI lenta, usuario impaciente):

1. POST #1: crea carpeta `Juan Pérez (1234567890)`.
2. POST #2 (simultáneo, antes de que POST #1 responda): también crea carpeta `Juan Pérez (1234567890)`.
3. Quedan 2 carpetas con el mismo nombre → confusión en Drive.

## 3. Acceptance Criteria

### AC-1: Chequeo de existencia ANTES de crear carpeta del tenant

- En `tenants.ts`, antes de `drive.files.create` para la carpeta del
  arrendatario, hacer un `drive.files.list` con el mismo `q` que la
  carpeta del inmueble:
  ```ts
  q: `name='${folderName}' and mimeType='folder' and '${propertyFolderId}' in parents and trashed=false`;
  ```
- Si `existing.data.files[0]` existe, usar ese `id` en vez de crear uno nuevo.
- Solo crear si NO existe.

### AC-2: Doble-click produce 1 sola carpeta

- Test manual: ejecutar 2 POSTs simultáneos al endpoint de creación de tenant
  con el mismo `name`/`idNumber`/`propertyId`.
- Verificar que Drive tiene 1 sola carpeta `Juan Pérez (1234567890)`.
- Verificar que la response de ambos POSTs apunta al mismo `tenant_drive_folder_id`.

### AC-3: Comportamiento exitoso sin cambios

- Para tenants únicos (caso normal), no hay cambio observable.
- Latencia adicional: 1 llamada a `drive.files.list` (~200ms). Aceptable.

### AC-4: Helper `findOrCreateFolder` reutilizable

- Crear `server/lib/driveHelpers.ts` con la función:

  ```ts
  async function findOrCreateFolder(
    drive: any,
    parentId: string,
    folderName: string,
    timeoutMs: number,
  ): Promise<string> {
    const existing = await withTimeout(
      drive.files.list({
        q: `name='${folderName.replace(/'/g, "\\'")}'
            and mimeType='application/vnd.google-apps.folder'
            and '${parentId}' in parents
            and trashed=false`,
        fields: "files(id)",
        spaces: "drive",
      }),
      timeoutMs,
      `drive.files.list (find ${folderName})`,
    );
    const existingId = existing.data.files?.[0]?.id;
    if (existingId) return existingId;

    const created = await withTimeout(
      drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        },
        fields: "id",
      }),
      timeoutMs,
      `drive.files.create (${folderName})`,
    );
    return created.data.id!;
  }
  ```

- Refactorizar `properties.ts:createPropertyFolders` y `tenants.ts` para usar este helper.
- Migración gradual: `properties.ts` (que ya tiene el chequeo manual) y `tenants.ts`
  ambos pasan a usar el helper.

## 4. Edge Cases

### EC-1: Drive no conectado

- `getFreshDriveClient()` lanza, `drive` es null.
- El handler sigue sin crear carpetas (comportamiento actual).

### EC-2: 3+ POSTs simultáneos

- Todos hacen `drive.files.list` antes de `create`. Solo 1 ve `existing` vacío y crea.
- Los otros 2+ ven la carpeta recién creada y la reutilizan.
- Sigue funcionando.

### EC-3: `trashed=true` en una carpeta vieja

- El filtro `trashed=false` excluye la carpeta borrada.
- Si el user la "borró" pero sigue en papelera, se crea una nueva.
- Comportamiento esperado: el cliente la puede borrar de la papelera si quiere.

### EC-4: Caracteres especiales en `name` (`O'Brien`, comillas)

- El helper escapa comillas simples: `name.replace(/'/g, "\\'")`.
- Idéntico al patrón actual de `properties.ts:277`.

## 5. Technical Contract

### Antes (sin dedupe)

```
POST /api/tenants (con mismo name+idNumber, 2 veces seguidas)
  → drive.files.list para property folder  (chequea)
  → drive.files.create para tenant folder  (NO chequea)  ← Crea siempre
  → drive.files.create para subcarpetas (Cedula, Contrato, Recibos)
```

### Después (con dedupe)

```
POST /api/tenants (con mismo name+idNumber, 2 veces seguidas)
  → drive.files.list para property folder  (chequea)
  → findOrCreateFolder(drive, propertyFolderId, tenantName)  ← NUEVO
  → drive.files.create para subcarpetas (idem, se mantiene — no es bug)
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                    | Tipo    | Copy exacto                                                            |
| -------------------------- | ------- | ---------------------------------------------------------------------- |
| Tenant creado OK           | success | `Inquilino creado` (sin cambios)                                       |
| Doble-click (2da response) | success | `Inquilino creado` (idéntico)                                          |
| Drive no conectado         | warning | `No se pudo crear la carpeta en Drive. Se creó el inquilino en MySQL.` |

## 7. Out of Scope

- Idempotencia total del endpoint (`If-Match` con ETag).
- Dedupe de las subcarpetas (Cedula/Contrato/Recibos) — son 3 fijas, bajo el
  mismo nombre universal, riesgo bajo.
- Tests automatizados con Vitest. Verifier E2E manual con 2 POSTs simultáneos.

## 8. Dependencias

- `server/lib/driveHelpers.ts` (nuevo, ~30 líneas, 0 deps).
- `tenants.ts:140-181` y `properties.ts:273-300` modificados.
- **BUG-014** (Ola 2): también quiere try/catch en `drive.files.create`. Se
  solapa: el helper ya envuelve con `withTimeout`, falta agregar `try/catch`
  si Drive lanza fuera del timeout. Documentado para sincronizar.

## 9. Effort

- Helper `findOrCreateFolder`: 20 min.
- Refactor `tenants.ts`: 15 min.
- Refactor `properties.ts`: 15 min.
- Test manual: 15 min.
- **Total: 1h**

---

**Pendiente de aprobación del usuario.**
