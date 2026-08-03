# Fix: propertyAddress sin escape SQL en tenants.ts (BUG-010)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-010-property-address-escape.md`.
>
> **Bug origen**: BUG-010 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media (defensiva — sin exploit conocido).
> **Stack afectado**: `server/routes/tenants.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que el campo `propertyAddress` que llega al crear un tenant sea tratado como string seguro al usarse en queries de Drive (escape de comillas),
**So that** un address con caracteres especiales (comillas simples, backslashes) no rompa la query de Drive o — peor — permita inyección de QL en el metadata de la carpeta.

## 2. Contexto del bug

### Estado actual (en `server/routes/tenants.ts:119` y siguientes)

```ts
const propertyAddress = (req.body as any).propertyAddress as string | undefined;
// ... más adelante ...
const existing = await withTimeout(
  drive.files.list({
    q: `name='${propertyAddress.replace(/'/g, "\\'")}' and mimeType='folder' and ...`,
  }),
  ...,
);
```

### Lo que el catálogo reporta

El catalog dice "properties.ts hace `String(address).replace(...)`, este no. Inconsistencia."

Mirando el código actual: `tenants.ts:158` SÍ tiene `.replace(/'/g, "\\'")`. Pero hay 2 problemas:

1. **No usa `String(...)`**: si `propertyAddress` es un objeto o array (caso de
   un body mal formado), `.replace` tira `TypeError`.
2. **No escapa backslashes**: si el address es `Calle O'Brien\test`, el `\t`
   se convierte en tab, no en literal `\t`.

### Comparación con `properties.ts:277`

```ts
// properties.ts:
const safeName = String(address).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
```

Esto escapa ambos caracteres correctamente.

## 3. Acceptance Criteria

### AC-1: Aplicar el mismo patrón de escape

- En `tenants.ts`, agregar una línea de escape al inicio del bloque
  "1a. Si no hay carpeta del inmueble":
  ```ts
  const safeAddress = String(propertyAddress ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
  ```
- Reemplazar TODOS los usos de `propertyAddress` en la query `q:` de
  `drive.files.list` por `safeAddress`.

### AC-2: Función helper `escapeDriveQueryValue` reutilizable

- Crear en `server/lib/driveHelpers.ts` (mismo archivo que `findOrCreateFolder`
  de BUG-009):
  ```ts
  export function escapeDriveQueryValue(s: string | null | undefined): string {
    return String(s ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }
  ```
- Usar en `tenants.ts` y `properties.ts` (reemplaza el patrón inline actual).

### AC-3: Edge cases cubiertos

- `propertyAddress = undefined` → query queda `name=''` (no rompe, busca
  carpetas con nombre vacío).
- `propertyAddress = null` → idem.
- `propertyAddress = "O'Brien"` → query queda `name='O\'Brien'`.
- `propertyAddress = "Calle\\test"` → query queda `name='Calle\\\\test'`.
- `propertyAddress = 12345` (número) → `String(12345)` → `'12345'`.

### AC-4: Sin cambios funcionales observables

- Para addresses válidos sin caracteres especiales, no hay diferencia en
  queries enviadas a Drive.
- Latencia: 0ms (escape es O(n) en memoria).

## 4. Edge Cases

### EC-1: `propertyAddress` es un objeto `{foo: 'bar'}`

- `String({foo:'bar'})` → `'[object Object]'`.
- La query queda `name='[object Object]'` (no rompe, no es lo que el user
  quería pero tampoco es un crash).
- Esto es un caso de body mal formado, no un ataque. El handler debería
  validar antes pero eso es out of scope.

### EC-2: Address muy largo (>1000 chars)

- `String(s).replace(...)` escala lineal.
- Drive `files.list` tiene límite en la query string (~8000 chars). Edge case
  que no es bug — el user no tipea 1000 chars en una dirección.

### EC-3: `propertyAddress` con caracteres no-ASCII (`Calle 93 Nº 11-27`)

- `.replace` opera byte-level pero los caracteres UTF-8 multi-byte no
  contienen `\` ni `'`. El escape no los afecta.
- Drive recibe la query con UTF-8 literal. OK.

## 5. Technical Contract

### Antes (escape parcial)

```ts
const propertyAddress = (req.body as any).propertyAddress as string | undefined;
// ...
q: `name='${propertyAddress.replace(/'/g, "\\'")}' and ...`;
```

### Después (escape completo, helper)

```ts
import { escapeDriveQueryValue } from "../lib/driveHelpers";

const safeAddress = escapeDriveQueryValue((req.body as any).propertyAddress);
// ...
q: `name='${safeAddress}' and ...`;
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                             | Tipo    | Copy exacto                      |
| ----------------------------------- | ------- | -------------------------------- |
| Tenant creado con address `O'Brien` | success | `Inquilino creado` (sin cambios) |

(No hay cambios de UX — el fix es 100% defensivo.)

## 7. Out of Scope

- Validar el shape de `req.body` (Zod, Joi). Out of scope de este fix.
- Escapear otros campos de queries Drive (`folderName`, etc.). El helper
  queda disponible para migrar después.
- Sanitización de output (el server devuelve strings raw — eso está OK).

## 8. Dependencias

- `server/lib/driveHelpers.ts` (nuevo, compartido con BUG-009).
- `tenants.ts` y `properties.ts` modificados para usar el helper.

## 9. Effort

- Helper `escapeDriveQueryValue`: 5 min.
- Refactor `tenants.ts`: 10 min.
- Refactor `properties.ts`: 10 min.
- Test manual con `O'Brien`: 10 min.
- **Total: 30 min**

---

**Pendiente de aprobación del usuario.**
