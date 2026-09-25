# Fix: App.tsx refactor (extracción de hooks + handlers)

> **Karpathy Spec** — FASE 4 del proyecto. App.tsx es el shell de la
> app. Hoy tiene 581 líneas (no las 3158 que AGENTS.md menciona — esa
> cifra es histórica, pre-PropertiesView refactor). Contiene:
> - Auth bootstrap (3 useEffect entrelazados)
> - Toast state + UI inline
> - 12 CRUD handlers (`handleAddProperty`, `handleUpdateProperty`, etc.)
> - Routing de vistas con permisos
> - Alerts re-derivation
>
> El refactor NO cambia comportamiento. Saca lógica que está mezclada
> con JSX para que:
> 1. El componente `App` quede <200 líneas y solo renderice.
> 2. Los hooks sean testeables aisladamente.
> 3. Las views no necesiten conocer `useAppStore` + `useBillingStore`
>    + `useContractStore` + `useAuthStore` simultáneamente.

## 1. User Story

**As a** developer que extiende features en InmoControl,
**I want to** que `src/App.tsx` sea un shell puro (state local mínimo
para UI, delega hooks/handlers a módulos dedicados),
**So that** pueda modificar el routing o agregar una vista nueva sin
tocar 580 líneas enredadas, y pueda testear los handlers en aislamiento.

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: `src/App.tsx` queda en <200 líneas

- El componente `App()` reduce a su responsabilidad: routing + JSX.
- Toda la lógica de state/handlers sale a hooks o módulos.

### AC-2: `src/shared/hooks/useToast.ts` (hook reutilizable)

- State + setter del toast.
- Auto-dismiss configurable (default 3s, warning 5s).
- API: `useToast()` retorna `{ toast, showToast }`.
- Misma API que la función `showToast` actual (compat 100%).

### AC-3: `src/features/auth/useAuthBootstrap.ts`

- Encapsula los 3 useEffect actuales:
  - Hidratación inicial + check Drive status.
  - Restore sesión via `/api/auth/me` cookie.
  - Re-hidratación post-login.
- API: `useAuthBootstrap({ setUser, clearAuth })`.
- DEVUELVE `{ loading }` que App usa para mostrar `LoadingScreen`.

### AC-4: `src/features/auth/useSessionTimeout.ts`

- Encapsula el useEffect de inactividad → logout.
- API: `useSessionTimeout({ user, onTimeout: handleLogout })`.
- Mantiene `SESSION_TIMEOUT_MS = 8 horas` (constante exportada).

### AC-5: `src/features/shell/useCrudHandlers.ts`

- Encapsula los 12 handlers de CRUD (`handleAddProperty`, etc.).
- API: `useCrudHandlers({ user, showToast, addProperty, updateProperty, ... })`.
- Retorna `{ handleAddProperty, handleUpdateProperty, ... }`.

### AC-6: `src/features/shell/useClosedMonths.ts` (state local)

- State `closedMonths` y `openedMonths` + handlers.
- API: `useClosedMonths()` retorna `{ closedMonths, openedMonths, handleCloseMonth, handleOpenMonth }`.
- Se podría persistir en Zustand más adelante; por ahora queda como hook
  de estado local.

### AC-7: `src/features/alerts/useAlertsDerivation.ts`

- Encapsula el useEffect que re-deriva alerts.
- API: `useAlertsDerivation({ contracts, invoices, properties, tenants })`.
- Consume `useAlertsStore` internamente.

### AC-8: `src/features/properties/useInventoryEndFromContract.ts`

- Encapsula `handleStartInventoryEndFromContract` + el state asociado
  (`inventoryModalProperty`, `inventoryPhase`).
- Es state compartido porque el modal de inventario se renderiza
  desde `PropertiesView`, no desde App. **Esta AC se DELATA a spec
  #5c** (mantener state en App por ahora).

### AC-9: Cero cambio funcional

- Mismos endpoints llamados, en el mismo orden.
- Mismos toasts con misma copy.
- Mismo timing (loading, animation, redirects).
- Mismas validaciones de permisos.

### AC-10: Type-check pasa

- `npm run lint` exit 0.
- `tsc --noEmit` exit 0.
- No se introduce `any` nuevo (los `any` legacy se mantienen).

### AC-11: Tests no se rompen

- `npm test` corre los 6 archivos de test existentes + `rateLimit.test.ts`.
- Todos siguen verdes (los que pueden correr en sandbox).

## 3. Edge Cases

### EC-1 — Login + restore simultáneos

- **Trigger**: el user abre la app con cookie válida Y hay user en authStore.
- **Comportamiento**: el `useAuthBootstrap` chequea primero el authStore;
  si hay user, NO llama a `/api/auth/me` (evita doble fetch).

### EC-2 — Logout durante una operación async

- **Trigger**: el user hace click en logout mientras un CRUD está en vuelo.
- **Comportamiento**: las promesas en vuelo se resuelven silenciosamente;
  el state nuevo del user ya está limpio. NO mostrar toasts "guardado"
  después del logout.

### EC-3 — `searchQuery` filtrado

- **Trigger**: searchQuery cambia mientras una vista carga.
- **Comportamiento**: el filtro se aplica sobre el state actual del
  store. NO cancela fetches (no hay fetches async para search).

### EC-4 — Multiple tabs con misma cookie

- **Trigger**: 2 tabs abiertas de la app, una hace logout.
- **Comportamiento**: la otra tab sigue con el user persistido en
  Zustand (no se entera del logout). Esto es by-design (el
  broadcast de logout cross-tab es spec futuro).

### EC-5 — `closedMonths` y `openedMonths` son state LOCAL

- **Trigger**: refresh del browser.
- **Comportamiento**: se pierden. NO se persisten (decisión consciente
  por ahora — el cierre de mes es operacional y se reaplica al
  recargar). Documentar este trade-off.

### EC-6 — Alerts re-derivation cost

- **Trigger**: 100 propiedades + 50 contratos + 200 facturas.
- **Comportamiento**: `deriveAlerts` corre en <50ms (test manual).
  No se optimiza prematuramente.

### EC-7 — Toast cleanup en unmount

- **Trigger**: el componente App se desmonta (raro pero posible en
  test/HMR).
- **Comportamiento**: el `setTimeout` del toast queda en el aire.
  Aceptable: no es crítico (memory leak trivial).

### EC-8 — `useEffect` exhaustive-deps warnings

- **Trigger**: ESLint o `react-hooks/exhaustive-deps`.
- **Comportamiento**: este repo no usa ESLint (per AGENTS.md). Si
  tsc lo objeta, agregar deps explícitamente.

### EC-9 — `loading` race condition

- **Trigger**: el primer mount, hydrate tarda, setLoading(false) se llama.
- **Comportamiento**: `LoadingScreen` se muestra solo en el primer
  render (loading=true). Después del hydrate, loading=false y se
  renderiza la app. Es lo que hace hoy.

### EC-10 — `inventoryModalProperty` shared state

- **Trigger**: abrir inventario final desde contrato en `ContractsView`.
- **Comportamiento**: la lógica de "abrir inventario en PropertiesView
  pasando por activeTab" se mantiene en App.tsx por simplicidad
  (moverlo a un Zustand store compartido se difiere a spec #5c).

## 4. Technical Contract

### Estructura de archivos resultantes

```
src/
  App.tsx                                  (~150 líneas)
  features/
    auth/
      useAuthBootstrap.ts                  (nuevo)
      useSessionTimeout.ts                 (nuevo)
    shell/
      useCrudHandlers.ts                   (nuevo)
      useClosedMonths.ts                   (nuevo)
    alerts/
      useAlertsDerivation.ts               (nuevo)
    properties/
      useInventoryEndFromContract.ts       (DIFERIDO a #5c)
  shared/
    hooks/
      useToast.ts                          (nuevo, AC-2)
```

### API de los hooks

```typescript
// useToast
export function useToast(): {
  toast: { message: string; type: 'success' | 'error' | 'warning' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
};

// useAuthBootstrap
export function useAuthBootstrap(): { loading: boolean };

// useSessionTimeout
export function useSessionTimeout(opts: {
  enabled: boolean;
  onTimeout: () => void;
}): void;
export const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

// useCrudHandlers
export function useCrudHandlers(opts: {
  user: LocalUser | null;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}): {
  handleAddProperty: (p: any) => void;
  handleUpdateProperty: (id: string, updates: any) => Promise<boolean>;
  handleUpdateTenant: (id: string, updates: any) => Promise<boolean>;
  handleAddTenant: (t: any) => void;
  handleAddRecord: (r: any) => void;
  handleDeleteTenant: (id: string) => Promise<void>;
  handleDeleteRecord: (id: string) => void;
  handleUpdateRecord: (r: any) => void;
};

// useClosedMonths
export function useClosedMonths(): {
  closedMonths: string[];
  openedMonths: string[];
  handleCloseMonth: (propertyId: string, month: string) => void;
  handleOpenMonth: (propertyId: string, month: string) => void;
};

// useAlertsDerivation
export function useAlertsDerivation(): void; // auto-consume stores
```

### Archivos a crear
- `src/shared/hooks/useToast.ts`
- `src/features/auth/useAuthBootstrap.ts`
- `src/features/auth/useSessionTimeout.ts`
- `src/features/shell/useCrudHandlers.ts`
- `src/features/shell/useClosedMonths.ts`
- `src/features/alerts/useAlertsDerivation.ts`

### Archivos a modificar
- `src/App.tsx` (consume los hooks; queda <200 líneas).

### Archivos a NO tocar
- Ningún `*.tsx` de vistas (PropertiesView, TenantsView, etc.).
- Ningún store (Zustand).
- Ningún endpoint.

## 5. Timeouts

- No aplica (es refactor puro de UI).

## 6. Tostadas

Sin cambios — los toasts existentes se mantienen con misma copy.
`useToast` conserva el contrato:
- `success`: 3000ms
- `error`: 3000ms
- `warning`: 5000ms

## 7. Dependencias

- Ninguna nueva.

## 8. Out of Scope

- ❌ Mover `closedMonths` a Zustand persist (decisión consciente: queda local).
- ❌ Cross-tab logout broadcast (spec futuro).
- ❌ `useInventoryEndFromContract` hook (diferido a #5c).
- ❌ Type-erasure de los `any` legacy (spec #5c).
- ❌ Tests unitarios de los hooks nuevos (reuso del patrón de tests
  existente si es trivial — pero no es objetivo del spec).

## 9. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Refactor introduce regression | Media | Alta | Hacer UN solo commit con TODOS los hooks a la vez, fácil de revertir |
| Loop infinito en useEffect | Baja | Alta | Mantener deps array igual al actual (sin agregar deps nuevos) |
| Closure stale en handlers | Media | Media | Mantener handlers en useCallback o como funciones top-level dentro del hook |
| Toast no se muestra | Baja | Baja | `useToast` es muy simple (useState + setTimeout) |

## 10. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** —
**Fecha de aprobación:** —

> Spec relacionado: AGENTS.md §"Estructura objetivo (Fase 2+)" que
> pide `shared/hooks/` poblado.

---

> **Recordatorio Karpathy**: una vez aprobado, sigue
> `tests/verifiers/fix-issue-app-refactor.md`. NO escribir
> código de implementación hasta que el spec esté aprobado Y el
> verifier también.