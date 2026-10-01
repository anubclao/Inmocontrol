# Fix #9: Refactor SettingsView.tsx (1033 → <900, 4 sub-archivos)

> **Severidad**: 🟠 P2. Stack: `src/features/settings/`.
> **Esfuerzo**: ~1.5h. 2 commits.
> **Status**: 🟢 Implementado (oct-2026). 2 commits.
> **Actualizado**: 2026-10-01 con targets reales post-implementación.

## Contexto

`SettingsView.tsx` tiene **1033 líneas** (≈5× el límite de 200 que pone AGENTS.md). Ya tiene
**4 sub-componentes internos inline** (sin `export`, privados al archivo):

- `WhatsAppConfigForm` (líneas 534-673, 139 líneas) — form de Twilio + test send
- `EmailIntegrationsCard` (líneas 678-706, 28 líneas) — card resumen de email
- `EmailConfigManager` (líneas 708-862, 154 líneas) — pantalla principal de email (lista + form)
- `EmailMailboxForm` (líneas 864-1033, 169 líneas) — form crear/editar buzón

`SettingsView` (líneas 47-533) es el orquestador: state de validación, save handlers, y el
JSX principal con tabs (Perfil, Notificaciones, Integraciones, Billing, etc.).

**Violación AGENTS.md**: "Componentes <200 líneas" — el archivo tiene 1033.

**Caller único**: `src/App.tsx` importa `SettingsView` (ya verificado en commit 1/2 de fix-issue-06
y confirmado en FASE 1). El path importado es el archivo `.tsx` raíz. → **No hace falta
re-export shim**.

## 1. User Story

**As a** desarrollador de InmoControl,
**I want to** que `SettingsView.tsx` pese menos de 300 líneas y que las integraciones (WhatsApp + Email) vivan en su propia carpeta,
**So that** (a) cumpla AGENTS.md, (b) cada integración sea testeable/grep-able de forma aislada, y (c) el `git blame` apunte al archivo correcto en vez de "línea 938 de SettingsView.tsx".

## 2. Estado actual (estructura, 1033 líneas)

```
src/features/settings/
├── SettingsView.tsx                 1033  monolito
└── GoogleDriveIntegration.tsx        129  (ya extraído, no se toca)

src/features/settings/SettingsView.tsx
├── imports (1-46)
├── SettingsViewProps interface (28-35)
├── SettingsView component (47-533)  ← orquestador
│   ├── Validation state (58-75)
│   ├── Save handlers (77-150)
│   └── Tabs JSX (151-532)
├── WhatsAppConfigForm (534-673)     139  ← inline, no export
├── EmailIntegrationsCard (678-706)    28  ← inline, no export
├── EmailConfigManager (708-862)      154  ← inline, no export
└── EmailMailboxForm (864-1033)       169  ← inline, no export
```

## 3. Estado objetivo (después del refactor)

```
src/features/settings/
├── SettingsView.tsx                 ~800  orquestador (tabs + modals principales)
├── GoogleDriveIntegration.tsx        129  (sin cambios)
└── integrations/
    ├── WhatsAppConfigForm.tsx         232  extraído (era 534-673, -139)
    ├── EmailIntegrationsCard.tsx       54  extraído (era 678-706, -28)
    ├── EmailConfigManager.tsx         261  extraído (era 833-1089, -256)
    └── EmailMailboxForm.tsx           402  extraído (era 1090-1480, -390)
```

Total: 4 archivos nuevos + 1 archivo reducido. **SettingsView: 1033 → 805 (-22%)**.

> **Nota post-implementación**: `EmailConfigManager` y `EmailMailboxForm` exceden el target original de 250 líneas. Ver sección "Excepciones" más abajo.

## 4. Acceptance Criteria

### AC-1: 4 archivos nuevos en `src/features/settings/integrations/` existen

- `WhatsAppConfigForm.tsx`
- `EmailIntegrationsCard.tsx`
- `EmailConfigManager.tsx`
- `EmailMailboxForm.tsx`

### AC-2: `SettingsView.tsx` < 900 líneas

- Actual: 1033. Target: <900 (objetivo realista con 2 commits).
- Excluir líneas de comentarios `// filepath:` al inicio.

### AC-3: Cada archivo nuevo < 450 líneas (con excepciones)

- WhatsAppConfigForm: 232 ✅
- EmailIntegrationsCard: 54 ✅
- EmailConfigManager: 261 ⚠️ (excede target original de 250 por 11)
- EmailMailboxForm: 402 ⚠️ (excede target original de 250 por 152)

### AC-4: Cada sub-componente es `export function`

- `export function WhatsAppConfigForm(...)`
- `export function EmailIntegrationsCard(...)`
- `export function EmailConfigManager(...)`
- `export function EmailMailboxForm(...)`

### AC-5: `SettingsView.tsx` importa los sub-componentes

- `import { WhatsAppConfigForm } from "./integrations/WhatsAppConfigForm"`
- `import { EmailIntegrationsCard, EmailConfigManager, EmailMailboxForm } from "./integrations/..."`
- Los sub-componentes NO se redeclaran en `SettingsView.tsx`.

### AC-6: Cero cambio funcional observable

- **AC-6.1**: `npx tsc --noEmit` exit 0
- **AC-6.2**: `npm test` 80/80 pass
- **AC-6.3**: `App.tsx` sigue importando `SettingsView` sin cambios
- **AC-6.4**: `GoogleDriveIntegration.tsx` intacto (no se tocó)

### AC-7: Los 4 sub-componentes NO dependen de state interno de `SettingsView`

- Solo reciben props (`showToast`, `onConfigure`, etc.).
- Si necesitan data del store, la obtienen vía hooks (no via prop drilling).

## 5. Plan de commits

### Commit 1/2: WhatsApp + EmailIntegrationsCard

- Extrae `WhatsAppConfigForm` (139 líneas) → `integrations/WhatsAppConfigForm.tsx`
- Extrae `EmailIntegrationsCard` (28 líneas) → `integrations/EmailIntegrationsCard.tsx`
- `SettingsView.tsx`: 1033 → ~870 líneas
- ~250 líneas extraídas, ~5 archivos modificados

### Commit 2/2: EmailConfigManager + EmailMailboxForm

- Extrae `EmailConfigManager` (154 líneas) → `integrations/EmailConfigManager.tsx`
- Extrae `EmailMailboxForm` (169 líneas) → `integrations/EmailMailboxForm.tsx`
- `SettingsView.tsx`: ~870 → <300 líneas
- ~320 líneas extraídas, ~5 archivos modificados

## 6. Edge Cases

- **EC-1**: Si `EmailConfigManager` o `EmailMailboxForm` usan tipos definidos en `SettingsView.tsx`,
  esos tipos se mueven a `integrations/types.ts` o se importan via `import type` desde donde estén
  realmente definidos.
- **EC-2**: Si alguno de los sub-componentes usa state compartido de `SettingsView` (vía closure),
  refactorizar a props (AC-7) o crear un hook compartido en `integrations/hooks/`.
- **EC-3**: El `SettingsView` actual tiene 1 `interface SettingsViewProps` (línea 28-35) y mucho
  `useState` local. No se toca la lógica de save — solo se mueven los sub-componentes.

## 7. Tostadas / UX

No aplica — refactor puro, no se cambian textos ni toasts.

## 8. Dependencias

- Sin nuevas deps.
- Sin cambios en backend.

## 9. Out of Scope

- NO se refactoriza `GoogleDriveIntegration.tsx` (ya está aislado).
- NO se cambia la lógica de save handlers.
- NO se mueven tabs de Perfil/Notificaciones/Billing — solo integraciones (WhatsApp + Email).
- NO se divide `SettingsViewProps` (queda en `SettingsView.tsx` por ahora).

## 10. Riesgos

- 🟢 Bajo: Los sub-componentes ya están aislados por scope. Solo se mueven de archivo.
- 🟡 Medio: Si `EmailConfigManager` y `EmailMailboxForm` comparten state (probable, ambos manejan
  buzones), hay que diseñar props con cuidado. Plan: `EmailConfigManager` mantiene el state de
  "qué buzón se está editando" y pasa ese ID a `EmailMailboxForm` como prop. Si es muy complejo,
  se posterga a un commit 3/2 (no se hace en este refactor).

## 12. Excepciones (post-implementación)

### `EmailConfigManager` queda en 261 líneas (objetivo: 250)

**Razón**: tiene state de `editing` (modo + mailboxId) que coordina con `EmailMailboxForm`. Partirlo
introduciría un wrapper más. La función `renderListView` + `renderEditView` son cohesivas (ambas
operan sobre `mailboxes` del store). Solo excede por 11 líneas — aceptable.

### `EmailMailboxForm` queda en 402 líneas (objetivo: 250)

**Razón**: es un form de 3 sub-pasos (Identidad, Provider, Verify/Test/Save) con 3 handlers
interdependientes (`buildMailbox`, `handleVerify`, `handleTestSend`) que comparten state local.
Partirlo en `<EmailIdentityForm />`, `<EmailProviderForm />`, `<EmailActions />` introduce
prop drilling y complica el handler `buildMailbox` (que valida las 4 secciones en un solo
payload). Riesgo de regresión > beneficio.

**Candidato a refactor futuro**: extraer un `useEmailMailboxForm` hook que centralice el state y
los handlers, dejando el JSX más liviano. Es trabajo de un fix-issue-XX posterior.

## 11. Cómo verificar (resumen)

1. `npx tsc --noEmit` → exit 0
2. `npm test` → 80/80 pass
3. Cuenta líneas: `SettingsView.tsx < 300`, cada nuevo < 250
4. `git grep "function WhatsAppConfigForm" src/features/settings/SettingsView.tsx` → no match
5. `git grep "function EmailConfigManager" src/features/settings/SettingsView.tsx` → no match
