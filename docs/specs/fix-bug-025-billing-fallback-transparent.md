# Fix: billing/api.ts tryBackendOrFallback miente al usuario (BUG-025)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-025-billing-fallback-transparent.md`.
>
> **Bug origen**: BUG-025 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `src/features/billing/api.ts`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que si el server falla al guardar una policy de billing, vea un error claro (no un toast de éxito),
**So that** no crea que la policy se guardó en MySQL cuando en realidad quedó solo en localStorage y se va a perder al refrescar.

## 2. Contexto del bug

### Estado actual (`src/features/billing/api.ts:80-90`)

```ts
async function tryBackendOrFallback<T>(
  backendCall: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  const mode = await detectMode();
  if (mode === "local") return fallback();
  try {
    return await backendCall();
  } catch (err) {
    console.warn("[billing/api] backend falló, usando fallback local:", err);
    return fallback();
  }
}
```

### Resultado

El caller (e.g. `savePolicy` en BillingPanel) hace:

```ts
const result = await tryBackendOrFallback(
  () => api("PUT", "/billing/policies/123", policy),
  () => saveToLocalStorage(policy),
);
showToast("✓ Billing configurado", "success"); // ← MENTIRA si server falló
```

El toast de éxito se muestra INCLUSO si el server devolvió 500 y la policy
solo quedó en localStorage. Cuando el user refresca, MySQL no tiene la
policy, localStorage sí — pero al volver a entrar a la vista, el cache
local se sobrescribe con el de MySQL y la policy desaparece.

## 3. Acceptance Criteria

### AC-1: Cambiar el contrato de `tryBackendOrFallback`

- En vez de devolver siempre el fallback silenciosamente, devolver un
  objeto con el source:

  ```ts
  type FallbackResult<T> =
    | { source: "backend"; value: T }
    | { source: "fallback"; value: T; reason: string };

  async function tryBackendOrFallback<T>(
    backendCall: () => Promise<T>,
    fallback: () => T | Promise<T>,
  ): Promise<FallbackResult<T>> {
    const mode = await detectMode();
    if (mode === "local") {
      return {
        source: "fallback",
        value: await fallback(),
        reason: "local mode",
      };
    }
    try {
      const value = await backendCall();
      return { source: "backend", value };
    } catch (err: any) {
      console.warn("[billing/api] backend falló, usando fallback local:", err);
      return {
        source: "fallback",
        value: await fallback(),
        reason: err?.message ?? "unknown",
      };
    }
  }
  ```

### AC-2: Caller decide qué hacer según el source

```ts
const result = await tryBackendOrFallback(
  () => api("PUT", "/billing/policies/123", policy),
  () => saveToLocalStorage(policy),
);
if (result.source === "backend") {
  showToast("✓ Billing configurado", "success");
} else {
  // Backend falló → fallback local
  showToast(
    "No se pudo guardar en el servidor. Guardado localmente. Reintentá cuando恢复了 conexión.",
    "warning",
  );
}
```

### AC-3: Migrar TODOS los callers

- Buscar todos los usos de `tryBackendOrFallback` en `billing/api.ts` y
  en los callers (`BillingPanel.tsx`, `BillingPolicyView.tsx`, etc.).
- Aplicar el patrón `if (result.source === 'backend') ... else ...`.

### AC-4: Backward compat (out of scope por ahora)

- Si la migración a `FallbackResult` rompe muchos callers, alternativa:
  dejar `tryBackendOrFallback` como helper de bajo nivel y crear
  `savePolicyWithFeedback` que devuelve el toast correcto.
- Decisión: empezar con AC-1 (refactor agresivo) y ver si la migración
  es viable.

## 4. Edge Cases

### EC-1: Server OK

- `result.source === 'backend'`.
- Toast success.
- Datos en MySQL ✅.

### EC-2: Server FAIL (500)

- `result.source === 'fallback'`.
- Toast warning (no success).
- Datos en localStorage ⚠️ (no persistente cross-device).
- User debe reintentar.

### EC-3: Modo local (decidido al detectMode)

- `mode === 'local'` → fallback directo.
- Toast warning "modo local, datos solo en este navegador".

### EC-4: Backend responde 401 (token expirado)

- catch → fallback.
- Toast warning.
- Out of scope: re-login automático.

## 5. Technical Contract

### Antes (mentira silenciosa)

```
savePolicy(policy)
  → tryBackendOrFallback(api.put, localStorage.set)
  → [fallback si server falla]
  → showToast("✓ Billing configurado")  ← MENTIRA
```

### Después (transparente)

```
savePolicy(policy)
  → tryBackendOrFallback(api.put, localStorage.set)
  → { source: 'backend' | 'fallback', value: policy }
  → if backend: showToast("✓ Billing configurado", success)
  → if fallback: showToast("Guardado localmente. Reintentá.", warning)
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                    | Tipo    | Copy exacto                                                                                   |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Save OK (backend)          | success | `Billing configurado` (sin cambios)                                                           |
| Save FAIL (fallback local) | warning | `No se pudo guardar en el servidor. Guardado localmente. Reintentá cuando恢复了 la conexión.` |
| Modo local                 | warning | `Modo local: los datos solo se guardan en este navegador.`                                    |

## 7. Out of Scope

- Reintento automático del POST cuando el server vuelve a estar disponible.
- Sincronización bidireccional localStorage ↔ MySQL.
- Quitar el modo local (es decisión de Fase 4 / SaaS).

## 8. Dependencias

- `src/features/billing/api.ts:80-90` refactorizado.
- Todos los callers de `tryBackendOrFallback` migrados.

## 9. Effort

- Refactor `tryBackendOrFallback`: 20 min.
- Buscar y migrar callers: 20 min.
- Test manual: 20 min.
- **Total: 1h**

---

**Pendiente de aprobación del usuario.**
