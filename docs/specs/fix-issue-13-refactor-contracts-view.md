# Fix #13: ContractsView 857 → <500 + 5 archivos <250

> **Severidad**: 🟡 P2. Stack: `src/features/contracts/`.
> **Esfuerzo**: ~1.5h. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`ContractsView.tsx` (857 líneas) tiene 6 sub-componentes inline + un
componente principal con mucha lógica de state. Los más grandes son:

- `ContractForm` (~250 líneas, tiene su propio state + useEffect)
- `ContractRow` (~80 líneas)
- `StatTile` (~30 líneas)
- `ContractDetail` (~50 líneas)
- `Row` (~10 líneas)
- `CurrencyInput` (~20 líneas, dentro de ContractForm)

## 2. Estado objetivo

```
src/features/contracts/
├── ContractsView.tsx                  ~400  orquestador
├── components/
│   ├── StatTile.tsx                   ~30
│   ├── ContractRow.tsx                ~85
│   ├── ContractForm.tsx              ~250  (limite duro, cohesivo)
│   ├── ContractDetail.tsx             ~55
│   ├── Row.tsx                        ~15
│   └── CurrencyInput.tsx              ~25
```

**Total**: 857 → ~400 (ContractsView) + 6 archivos entre 15-250 líneas.

## 3. Acceptance Criteria

### AC-1: 6 archivos nuevos en `src/features/contracts/components/`

### AC-2: `ContractsView.tsx` < 500 líneas

### AC-3: Cada archivo < 250 líneas (ContractForm justo en el límite)

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: Sin cambios funcionales
