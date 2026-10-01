# Fix #9b: SettingsView commit 3/2 — extraer tabs restantes

> **Severidad**: 🟢 P3. Stack: `src/features/settings/`.
> **Esfuerzo**: ~1h. 1 commit.
> **Status**: ⏳ Pendiente (Karpathy FASE 2 — no tocar código hasta aprobación).
> **Creado**: 2026-10-01.
> **Contexto**: continuación del fix-issue-09 (commits 1/2 + 2/2 ya publicados).

## Contexto

`SettingsView.tsx` quedó en **805 líneas** tras los commits 1/2 y 2/2 del fix-issue-09
(extracción de integraciones de WhatsApp + Email). Aún contiene 6 tabs inline:

| Tab           | Líneas | Viabilidad de extracción                                             |
| ------------- | ------ | -------------------------------------------------------------------- |
| profile       | 114    | 🔴 Difícil (closures con state de form)                              |
| agency        | 107    | 🔴 Difícil (closures con state de form)                              |
| security      | 105    | 🔴 Difícil (closures con passwords)                                  |
| notifications | 55     | 🟢 **Fácil** (solo necesita `notifications` y `toggleNotification`)  |
| billing       | 32     | 🟡 Media (necesita `setPlanAdminOpen` y render de `SaasBillingView`) |
| integrations  | 80     | 🟢 **Fácil** (los sub-componentes ya están extraídos en commit 1/2)  |

**Decisión**: extraer solo las 3 tabs viables (notifications, billing, integrations) en un commit
3/2. Las otras 3 (profile, agency, security) requieren refactor del state de form a hooks
separados — eso es otro `fix-issue-XX` (mucho más invasivo, mejor dedicado).

**Objetivo**: SettingsView 805 → <600 líneas.

## 1. User Story

**As a** desarrollador de InmoControl,
**I want to** que las tabs simples de SettingsView vivan en su propio archivo,
**So that** (a) SettingsView se enfoque solo en el shell de navegación, y (b) cada tab sea testeable/grep-able de forma aislada.

## 2. Estado actual (805 líneas)

```
src/features/settings/SettingsView.tsx
├── imports (1-46)
├── SettingsViewProps interface (28-35)
├── SUB_TABS (45-65)
├── SettingsView component (65-805)
│   ├── Validation state (76-95)
│   ├── Profile tab JSX (235-349)         ← queda inline (out of scope)
│   ├── Agency tab JSX (350-457)          ← queda inline (out of scope)
│   ├── Security tab JSX (458-563)        ← queda inline (out of scope)
│   ├── Notifications tab JSX (564-619)   ← SE EXTRAE
│   ├── Billing tab JSX (620-652)         ← SE EXTRAE
│   ├── Integrations tab JSX (653-732)    ← SE EXTRAE
│   └── Modal: Plan admin (733-815)
```

## 3. Estado objetivo

```
src/features/settings/
├── SettingsView.tsx                     <600  orquestador (sin 3 tabs)
├── GoogleDriveIntegration.tsx            129  (intacto)
└── tabs/                                 (nuevo dir)
    ├── NotificationsTab.tsx              ~70   extraído
    ├── BillingTab.tsx                    ~50   extraído
    └── IntegrationsTab.tsx              ~100   extraído
```

## 4. Acceptance Criteria

### AC-1: 3 archivos nuevos en `src/features/settings/tabs/` existen

- `NotificationsTab.tsx`
- `BillingTab.tsx`
- `IntegrationsTab.tsx`

### AC-2: `SettingsView.tsx` < 600 líneas

- Actual: 805. Target: <600.
- Reducción: 205+ líneas.

### AC-3: Cada archivo nuevo < 200 líneas

- Restricción dura de AGENTS.md.

### AC-4: Cada tab es `export function`

- `export function NotificationsTab(...)`
- `export function BillingTab(...)`
- `export function IntegrationsTab(...)`

### AC-5: `SettingsView.tsx` importa las 3 tabs y NO las redeclara

- Misma convención que en fix-issue-09: 3 imports en `SettingsView` desde `./tabs/`.
- No se redeclaran los componentes como funciones locales.

### AC-6: Cero cambio funcional observable

- **AC-6.1**: `npx tsc --noEmit` exit 0
- **AC-6.2**: `npm test` 80/80 pass
- **AC-6.3**: `App.tsx` sigue importando `SettingsView` sin cambios
- **AC-6.4**: Las 3 tabs que NO se extraen (profile, agency, security) siguen funcionando idéntico

### AC-7: Las tabs reciben solo lo que necesitan

- **NotificationsTab**: solo `notifications` (record) + `toggleNotification` (función).
- **BillingTab**: solo `setPlanAdminOpen` + `showToast` + `SaasBillingView` (ya existe).
- **IntegrationsTab**: solo `setSelectedIntegration` + `showToast` + sub-componentes.

## 5. Plan de commits

### Único commit 3/2: extraer NotificationsTab + BillingTab + IntegrationsTab

- ~205 líneas extraídas, 4 archivos modificados.
- SettingsView 805 → ~600.

## 6. Edge Cases

- **EC-1**: `NotificationsTab.toggleNotification` usa index numérico. Se mantiene la firma
  `(i: number) => void` (no se cambia a key string para no romper state).
- **EC-2**: `BillingTab` reusa `SaasBillingView` (que ya existe). Solo se mueve el wrapper JSX
  que tiene el header + botón "Administrar planes".
- **EC-3**: `IntegrationsTab` ya renderiza los sub-componentes que extrajimos en commit 1/2
  (`GoogleDriveIntegration`, `EmailIntegrationsCard`). Solo se mueve el bloque JSX.

## 7. Tostadas / UX

No aplica — refactor puro.

## 8. Dependencias

Sin nuevas deps.

## 9. Out of Scope

- NO se extraen las tabs **profile**, **agency**, **security** (requieren refactor del state
  de form a hooks separados — candidato a `fix-issue-XX` futuro).
- NO se mueve el `Modal: Plan admin` (parte de `BillingTab` actual, lo dejamos con
  `SettingsView` por ahora).
- NO se tocan integraciones (ya extraídas en commit 1/2 y 2/2).

## 10. Riesgos

- 🟢 Bajo: las 3 tabs son JSX puros con props simples. No tienen state interno oculto.
- 🟡 Bajo: `BillingTab` renderiza `SaasBillingView` que es un componente grande. El wrapper
  no agrega valor, pero moverlo deja la responsabilidad de "billing en Settings" clara.
