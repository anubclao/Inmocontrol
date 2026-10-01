# Fix #18: StepBasic 552 → <250 + 2 subcomponentes

> **Severidad**: 🟢 P3. Stack: `src/features/properties/components/`.
> **Esfuerzo**: ~45 min. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`StepBasic.tsx` (552 líneas) tiene 2 secciones inline grandes que se
pueden extraer limpiamente:

| Sección                | Líneas (aprox) | Tipo            |
| ---------------------- | -------------- | --------------- |
| Header + datos básicos | ~140           | inline en shell |
| Propietarios (N)       | ~190           | extraer         |
| Unidades adicionales   | ~140           | extraer         |
| Footer (botones)       | ~30            | inline en shell |

## 2. Estado objetivo

```
src/features/properties/components/
├── StepBasic.tsx                                  ~200  shell + header + footer
└── stepBasic/
    ├── WizardOwnersSection.tsx                    ~180  N propietarios
    └── WizardUnitsSection.tsx                     ~150  N unidades adicionales
```

**Total**: 552 → ~200 (StepBasic) + 2 archivos de ~150-180 líneas.

## 3. Acceptance Criteria

### AC-1: 2 archivos nuevos en `src/features/properties/components/stepBasic/`

- `stepBasic/WizardOwnersSection.tsx` ✓
- `stepBasic/WizardUnitsSection.tsx` ✓

### AC-2: `StepBasic.tsx` < 250 líneas

Reducción esperada: 552 → ~200 (-64%).

### AC-3: Cada archivo nuevo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: Sin cambios funcionales

- Validación de campos sigue funcionando
- Botones "Agregar propietario" / "Garaje/Depósito/Otro" funcionan
- La suma de % de participación se valida igual
- Botón "Guardar avance" / "Continuar a Documentación" siguen ahí
