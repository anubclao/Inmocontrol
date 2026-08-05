# Fix Spec — Wizard docs / auto-save / lista (agosto 2026)

> Spec consolidado de los 3 bugs reportados en sesión 2026-08-05:
>
> 1. Documentos del propietario no se ven al cerrar y abrir el detalle
> 2. Avance del inventario se pierde si se cierra el browser
> 3. La lista de propiedades queda stale al volver del wizard (requiere F5)

## User Story

> Como agente inmobiliario en `inmocontrol.tecnowebsupportia.com`,
> cuando completo el wizard de captación de una propiedad, quiero que:
> (a) los documentos del propietario que subí a Drive aparezcan en el detalle sin
> hacer refresh manual, (b) el avance del inventario se guarde automáticamente
> para no perder mi trabajo, y (c) al volver al menú de propiedades vea la
> nueva sin tener que tocar F5.

## Acceptance Criteria

### AC-1 — Documentos visibles en el detalle tras finalizar wizard

- **AC-1.1** Al finalizar el wizard con al menos 1 documento subido, al hacer
  click en "Ver detalle" de la propiedad recién creada, el modal muestra
  todos los documentos en sus slots correctos (CC, Certificado, Predial, RUT,
  Mandato si está firmado) con su URL real de Drive.
- **AC-1.2** El refetch del detalle usa `GET /api/properties/:id` y los badges
  🟢 "En Drive" son visibles al lado de cada doc (igual que en el wizard).
- **AC-1.3** NO aparece la URL blob:`/tmp/` después de cerrar el wizard —
  la URL de Drive ya persistió en `property_documents` o
  `properties.mandato_pdf_url`.

### AC-2 — Auto-save del inventario

- **AC-2.1** Cualquier modificación en el wizard de inventario (contador,
  área, foto, firma, custom area) se persiste automáticamente en
  `localStorage` bajo la clave `inmocontrol:draft:inventory:<propertyId>`
  en menos de 500ms.
- **AC-2.2** Cada 5 segundos (debounced) o al cerrar la pestaña, se hace un
  flush a `POST /api/inventories` con el draft. La respuesta exitosa se
  descarta (idempotente).
- **AC-2.3** Si el usuario cierra el browser y vuelve a entrar a la misma
  propiedad, el wizard del inventario se reabre con el último estado
  guardado, mostrando un toast no-bloqueante:
  > "🔄 Avance del inventario restaurado — última edición: 2026-08-05 17:42"
- **AC-2.4** El draft se descarta explícitamente cuando el usuario
  finaliza el wizard exitosamente (no queda en localStorage).

### AC-3 — Lista de propiedades refresca al volver del wizard

- **AC-3.1** Al hacer click en "Propiedades" en el sidebar (o al volver
  desde la vista de detalle/wizard), la lista hace `GET /api/properties`
  SIEMPRE, sin caché stale.
- **AC-3.2** Las propiedades creadas en los últimos 5 minutos se ven sin F5.
- **AC-3.3** Al hacer click en "Nueva Captación" → completar el wizard →
  volver, la propiedad nueva aparece en la lista con un highlight suave
  (border azul por 3 seg) que indica "recién creada".

## Edge Cases

| #   | Caso                                                                                     | Comportamiento esperado                                                                                                |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| E1  | Usuario sube doc en step 2, pero el server rechaza `POST /api/properties` por validación | El wizard muestra error inline; el doc queda en `blob:` localStorage como backup.                                      |
| E2  | Usuario tiene 2 pestañas abiertas del mismo wizard                                       | Ambas ven los mismos datos por propertyId; el último POST gana.                                                        |
| E3  | localStorage lleno (5MB+ ya ocupados)                                                    | El auto-save a localStorage falla silenciosamente y muestra warning. El auto-save a MySQL sigue funcionando.           |
| E4  | Server down durante auto-save                                                            | Toast: "Sin conexión — el avance queda solo en este navegador". Al volver online, próximo flush sube.                  |
| E5  | Usuario quiere descartar el avance                                                       | Botón "Descartar avance" en el wizard → limpia localStorage + DELETE /api/inventories/:id (si existe draft en server). |
| E6  | 2 propiedades distintas abiertas en paralelo                                             | Cada una tiene su propia clave de localStorage con el propertyId — sin colisión.                                       |

## Technical Contract

### Frontend (TypeScript / React 19)

#### Nueva utility: `src/shared/hooks/useDraftPersistence.ts`

```typescript
type UseDraftPersistenceArgs<T> = {
  key: string; // ej: "inventory:<propertyId>"
  value: T; // estado actual
  flushTo?: (value: T) => Promise<void>; // debounced flush a MySQL (opcional)
  debounceMs?: number; // default 5000
  onRestore?: (value: T) => void; // se llama si hay draft al mount
  onClear?: () => void; // limpia después de exitoso
};
```

#### Modificaciones a `src/features/properties/PropertiesView.tsx`

- `useEffect` al mount: `await fetchProperties()` siempre (invalida cache).
- Después de `handleFinalize` exitoso: `invalidatePropertiesList()` en el
  store Zustand + navega al detalle.
- Animación CSS de highlight (3s) en la card recién creada via className
  `just-created`.

#### Modificaciones a `src/features/properties/wizard/StepInventory.tsx`

- Wrap del state local en `useDraftPersistence` con flush al endpoint
  existente `POST /api/inventories` (idempotente).
- Toast no-bloqueante al mount si hay draft restaurado.

#### Modificaciones a `src/shared/store/appStore.ts`

- Nuevo selector: `invalidatePropertiesList()` — setea un flag `properties.staleAt = Date.now()`.
- En `selectProperties`, si `staleAt > lastFetchedAt`, dispara refetch.

### Backend (Express + MySQL)

**No requiere cambios nuevos.** Los endpoints existentes soportan el flow:

- `GET /api/properties/:id` ya retorna `documents` array con file_url ✓
- `GET /api/properties` ya retorna lista con `inventory_count` ✓
- `POST /api/inventories` ya es idempotente (upsert por `id` o insert) ✓

### Datos a persistir

#### localStorage (browser)

- Key: `inmocontrol:draft:inventory:<propertyId>`
- Shape: `{ counters, areas, photos, signatures, customAreas, updatedAt }`
- TTL: nunca (hasta que se finalice o descarte explícitamente)

#### MySQL (server)

- Tabla `inventories` ya existente, columnas: `counters`, `areas`,
  `photos`, `signatures`, `custom_areas` (todos JSON).
- Para el "draft", NO creamos nueva columna `is_draft`. Se distingue por
  la presencia/ausencia de `signed_at` (NULL = draft, NOT NULL = firmado).
  Esto evita una migración nueva.

## Dependencias

- ✅ `zustand` (ya aprobado en AGENTS.md)
- ✅ `crypto.randomUUID()` nativo del browser
- ✅ Fetch API nativa — no necesitamos axios ni react-query
- ❌ NO agregar `react-query` ni `swr` (discusión previa, fuera de scope)

## Out of Scope

- **Multi-device sync en tiempo real** (WebSockets, etc.) — solo local
  - flush a MySQL.
- **Versionado de drafts** (no hay historial; el último gana).
- **Compresión de fotos antes de subir a localStorage** — si pasan los 5MB
  del límite, el warning es suficiente por ahora.
- **Migración a SaaS** — sigue siendo piloto single-tenant.

## Tostadas exactas (copy approved, NO improvisar)

| Evento                            | Mensaje exacto                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Restore de draft exitoso          | `🔄 Avance del inventario restaurado — última edición: {formattedDate}`                        |
| Auto-save a MySQL OK (silencioso) | (ninguno — sin toast para no molestar)                                                         |
| localStorage lleno                | `⚠ No se pudo guardar el avance local. El avance sigue funcionando si no cerrás esta pestaña.` |
| Server down durante flush         | `Sin conexión — el avance queda solo en este navegador` (warning, no error)                    |
| Discard explícito                 | `🗑 Avance descartado`                                                                         |

## Timeouts explícitos

- Flush a MySQL: `AbortController` con timeout de **10 segundos**. Si expira,
  retry una vez y después marcar como "offline" silenciosamente.
- Fetch inicial de lista: timeout de **15 segundos** (puede ser cold start
  de Hostinger).

## Verifier (FASE 3) — ver `tests/verifiers/fix_wizard_docs_persistence.md`

## Open questions para el user (después de implementar)

1. ¿Querés que el highlight "recién creada" se vea también en vista mobile
   o solo desktop?
2. ¿La animación de highlight debe respetar `prefers-reduced-motion`?
