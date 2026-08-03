# Fix: addProperty con spread ...p pisa los defaults (BUG-020)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-020-addproperty-spread-overrides.md`.
>
> **Bug origen**: BUG-020 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `src/shared/store/appStore.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que cuando agrego una propiedad con campos opcionales undefined (e.g. `chip` sin cargar), el state de Zustand tenga `chip: ''` (string vacío), no `chip: undefined`,
**So that** las cards de la UI no rendericen `[object Object]` ni `undefined` literalmente.

## 2. Contexto del bug

### Estado actual (`src/shared/store/appStore.ts:325-345` y 365-385)

```ts
const local: Property = {
  id: p.id,
  address: p.address ?? "",        // default: ""
  chip: p.chip ?? "",              // default: ""
  // ... más defaults ...
  createdAt: new Date().toISOString(),
  ...p,                             // ← BUG: spread al final pisa los defaults
} as Property;
```

### Resultado

Si `p.chip === undefined`:
- `chip: p.chip ?? ""` setea `chip: ""` (correcto).
- `...p` al final hace `chip: undefined` (sobreescribe con undefined).
- Zustand guarda `chip: undefined`.
- UI renderiza `undefined` o `[object Object]` (peor si `p` trae un objeto).

### Caso real (agregado por wizard con form incompleto)

El wizard pasa un objeto parcial. `p.chip` puede ser:
- `undefined` (campo no completado)
- `""` (campo completado pero vacío)
- `"ABC-123"` (campo completo)

El primer caso rompe la card.

## 3. Acceptance Criteria

### AC-1: Mover `...p` ANTES de los defaults

```ts
const local: Property = {
  ...p,                             // ← primero: aplicar valores del payload
  id: p.id,                          // explícito (id siempre presente)
  address: p.address ?? "",          // defaults SOLO si el campo no vino
  chip: p.chip ?? "",
  // ...
  createdAt: new Date().toISOString(), // explícito: SIEMPRE ahora
} as Property;
```

Con este orden:
- Si `p.chip = "ABC"`: el spread pone `chip: "ABC"`, el default `??` no aplica.
- Si `p.chip = undefined`: el spread pone `chip: undefined`, el default `chip: p.chip ?? ""` aplica y setea `""`.
- Si `p.chip = ""`: el spread pone `chip: ""`, el default `??` no aplica (porque `"" ?? ""` es `""`).

### AC-2: Misma corrección en el segundo bloque (POST /api/properties)

- El bloque `created: Property` en `addProperty` (línea ~365) tiene el mismo bug.
- Mismo fix: mover `...p` al principio.

### AC-3: Validar que NO se rompe la firma del tipo `Property`

- `Property` requiere `address: string` (no `string | undefined`).
- Después del fix, todos los campos string son `string` (nunca `undefined`).
- `tsc --noEmit` debe seguir exit 0.

### AC-4: Comportamiento exitoso sin cambios

- Si el wizard pasa todos los campos, el state final es idéntico al actual.
- Latencia: 0ms.

## 4. Edge Cases

### EC-1: `p` es un objeto vacío

- Spread: `{}` → no agrega nada.
- Defaults: todos aplican.
- `local = {id: undefined, address: "", chip: "", ...}`. El caller tiene que
  pasar `p.id` (de lo contrario es un bug de tipo de entrada).

### EC-2: `p.address = null` (no undefined)

- `null ?? ""` → `""`. Default aplica.
- `...p` spread antes: `address: null` queda en el spread, pero el default después lo pisa.
- ✅ OK.

### EC-3: `p.driveFolderId = ""`

- `"" ?? null` → `""` (no es nullish). Default NO aplica.
- Spread antes: `driveFolderId: ""` queda.
- ⚠️ ¿Es lo que queremos? `Property.driveFolderId: string | null` acepta `""` per TS.
- No es bug; es decisión de tipo. Out of scope.

### EC-4: `p` trae campos que NO están en `Property`

- Spread antes: `{extra: 'foo'}` → la propiedad `extra` queda en el objeto.
- Cast `as Property` lo permite.
- La UI no renderiza estos campos (TS los ignora), pero ocupan memoria.
- Out of scope: validar shape de `p` con Zod.

## 5. Technical Contract

### Antes (defaults pisados por spread)

```ts
const local: Property = {
  address: p.address ?? "",  // "" si undefined
  chip: p.chip ?? "",        // "" si undefined
  // ... más defaults ...
  ...p,                        // ← chip: undefined si p.chip era undefined
} as Property;
// Resultado: { address: "", chip: undefined, ... }  ← BUG
```

### Después (spread no pisa)

```ts
const local: Property = {
  ...p,                                          // primero
  address: p.address ?? "",                       // defaults aplican
  chip: p.chip ?? "",
  // ... más defaults ...
  createdAt: new Date().toISOString(),
} as Property;
// Resultado: { address: "", chip: "", ... }  ← CORRECTO
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| addProperty OK | success | `Propiedad agregada` (sin cambios) |

(No hay cambios de UX — el fix es 100% defensivo.)

## 7. Out of Scope

- Validar shape de `p` con Zod.
- Migrar a `unknown` + runtime validation.
- Tests automatizados. Verifier E2E manual con `console.log` del state.

## 8. Dependencias

- `appStore.ts:325-345` (rama `if (p.id)`) y `appStore.ts:365-385` (rama POST).

## 9. Effort

- Mover 2 spreads: 5 min.
- Test manual con 3 casos (undefined, "", valor): 10 min.
- **Total: 15 min**

---

**Pendiente de aprobación del usuario.**
