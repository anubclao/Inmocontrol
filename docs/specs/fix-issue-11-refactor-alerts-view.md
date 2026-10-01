# Fix #11: AlertsView 947 → <400 + 7 archivos <250

> **Severidad**: 🟡 P2. Stack: `src/features/alerts/`.
> **Esfuerzo**: ~1.5h. 1 commit.
> **Status**: ⏳ Pendiente.
> **Creado**: 2026-10-01.

## 1. Contexto

`AlertsView.tsx` (947 líneas) es el siguiente archivo más grande de `src/` después de
`StepInventory.tsx` (ya refactorizado en fix-issue-10 a 302). Contiene 6
sub-componentes inline que se pueden extraer limpiamente:

| Sub-componente       | Líneas | Tipo                  |
| -------------------- | ------ | --------------------- |
| `StatCard`           | ~30    | Card con ícono + stat |
| `AlertList`          | ~170   | Lista colapsable      |
| `RuleRow`            | ~135   | Fila de regla         |
| `ChannelConfigRow`   | ~130   | Fila de canal         |
| `LogRow`             | ~30    | Fila de log           |
| `EmailChannelSummary`| ~30    | Resumen de buzones    |

Las constantes `SEVERITY_BADGE`, `CATEGORY_ICON`, `CHANNEL_ICON`, `CHANNEL_COLOR`
también se extraen a un `constants.ts` para que los sub-componentes las reusen.

## 2. Estado objetivo

```
src/features/alerts/
├── AlertsView.tsx                    ~380  orquestador (sin 6 subcomponentes)
├── alertsStore.ts                      56  (intacto)
├── channels.ts                        153  (intacto)
├── deriveAlerts.ts                    149  (intacto)
├── notificationConfigStore.ts         196  (intacto)
├── notificationLogStore.ts             48  (intacto)
├── ruleTypes.ts                       122  (intacto)
├── types.ts                            67  (intacto)
├── useAlertsDerivation.ts              31  (intacto)
├── useNotificationEngine.ts           193  (intacto)
└── components/                         (nuevo dir)
    ├── constants.ts                   ~40  SEVERITY_BADGE + CATEGORY_ICON + CHANNEL_ICON + CHANNEL_COLOR
    ├── StatCard.tsx                   ~50  card con ícono + stat
    ├── AlertList.tsx                 ~180  lista colapsable de alertas
    ├── RuleRow.tsx                   ~140  fila de regla (canales + audiencias + offset)
    ├── ChannelConfigRow.tsx          ~150  fila de canal (email/whatsapp/in_app)
    ├── LogRow.tsx                     ~40  fila del historial
    └── EmailChannelSummary.tsx        ~50  mini-resumen de buzones
```

**Total**: 947 → ~380 (AlertsView) + 7 archivos entre 40-180 líneas.

## 3. Acceptance Criteria

### AC-1: 7 archivos nuevos en `src/features/alerts/components/`

- `constants.ts`
- `StatCard.tsx`
- `AlertList.tsx`
- `RuleRow.tsx`
- `ChannelConfigRow.tsx`
- `LogRow.tsx`
- `EmailChannelSummary.tsx`

### AC-2: `AlertsView.tsx` < 400 líneas

- Actual: 947. Target: <400. Reducción: 547+ (-58%).

### AC-3: Cada archivo nuevo < 250 líneas

- Restricción dura de AGENTS.md.

### AC-4: Cada componente es `export function`

- `export function StatCard(...)`, etc.
- Constantes: `export const SEVERITY_BADGE: ...`, etc.

### AC-5: `AlertsView.tsx` importa los 7 nuevos archivos y NO los redeclara

- 7 imports al top de `AlertsView.tsx`.
- No se redeclaran las funciones localmente.

### AC-6: Cero cambio funcional observable

- `npx tsc --noEmit` exit 0
- `npm test` 80/80 pass
- App.tsx sigue importando AlertsView sin cambios
- El Centro de Notificaciones funciona idéntico

## 4. Riesgos

- 🟢 Bajo: las props ya están bien definidas en el archivo original.
  Solo se mueven a interfaces con nombre y se importan.
- 🟡 Bajo: el `useNotificationConfigStore` se referencia desde varios
  sub-componentes — verificar que el import path sea correcto desde
  `src/features/alerts/components/`.

## 5. Plan de commits

Único commit: extraer los 7 archivos. Sin FASE intermedia.
