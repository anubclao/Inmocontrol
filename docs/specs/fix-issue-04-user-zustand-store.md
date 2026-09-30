# Fix #4: Migrar `user` de localStorage a Zustand store

> **Severidad**: 🟡 P2 (viola AGENTS.md "Todo va por Zustand").  
> **Severidad efectiva**: 🔴 P0 si multi-tenant se considera (sesión cruzada entre users en misma máquina).  
> Stack: `src/shared/store/authStore.ts` (nuevo), `src/App.tsx`, `src/features/auth/LoginScreen.tsx`.

## AC-1: Existe `useAuthStore` con `persist` middleware

- Clave root: `inmocontrol:auth:v1`.
- Estado: `{ user: LocalUser | null, role: Role | null, loading: boolean }`.
- Acciones: `setUser`, `setRole`, `clear`, `hydrate`.

## AC-2: `App.tsx` usa `useAuthStore` en vez de `localStorage.getItem(STORAGE_KEYS.user)`

- Remover las 6 referencias a `localStorage` directo en `App.tsx`.

## AC-3: `handleLogin` y `handleLogout` usan store

- Mismo patrón que las otras acciones del store.

## AC-4: No se rompe la app al cambiar de user

- Verificar que logout + login limpia el store y re-hidratata.

## Effort

- 1 archivo nuevo (~50 líneas) + refactor de 2 archivos existentes (~30 líneas modificadas).

---

**Status:** ⏳ Pendiente impl.