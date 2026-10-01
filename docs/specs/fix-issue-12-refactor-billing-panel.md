# Fix #12: BillingPanel 882 → <500 + 5 archivos <250

> **Severidad**: 🟡 P2. Stack: `src/features/billing/views/`.
> **Esfuerzo**: ~1.5h. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`BillingPanel.tsx` (882 líneas) es el panel de detalle de billing de una
propiedad. Hace todo: state, carga, handlers, render. Contiene 3
sub-componentes inline y los handlers más complejos están en el cuerpo principal.

## 2. Estado objetivo

```
src/features/billing/views/
├── BillingPanel.tsx                   ~400  orquestador
├── BillingView.tsx                    215  (intacto)
└── billingPanel/                      (nuevo dir)
    ├── hooks/
    │   ├── useBillingActions.ts      ~150  save policy + regenerate + charges + increases
    │   └── useBillingInvoice.ts      ~220  send invoice + pay
    └── sections/
        ├── Header.tsx                 ~25  header con back
        ├── ChargesSection.tsx         ~80  lista de cargos
        └── IncreasesSection.tsx       ~75  lista de aumentos
```

**Total**: 882 → ~400 (BillingPanel) + 5 archivos entre 25-220 líneas.

## 3. Acceptance Criteria

### AC-1: 5 archivos nuevos en `src/features/billing/views/billingPanel/`

- `hooks/useBillingActions.ts`
- `hooks/useBillingInvoice.ts`
- `sections/Header.tsx`
- `sections/ChargesSection.tsx`
- `sections/IncreasesSection.tsx`

### AC-2: `BillingPanel.tsx` < 500 líneas

- Actual: 882. Target: <500. Reducción: 382+ (-43%).

### AC-3: Cada archivo < 250 líneas

- Restricción dura de AGENTS.md.

### AC-4: `BillingPanel.tsx` importa los 5 archivos y NO los redeclara

### AC-5: Cero cambio funcional

- tsc exit 0
- npm test 80/80 pass
- App.tsx sin cambios
- Flujo de billing idéntico
