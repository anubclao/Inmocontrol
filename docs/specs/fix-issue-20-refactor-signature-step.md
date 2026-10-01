# Fix #20: SignatureStep 631 → <250 + 3 subcomponentes + 1 hook

> **Severidad**: 🟢 P3. Stack: `src/features/properties/components/`.
> **Esfuerzo**: ~1h. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`SignatureStep.tsx` (631 líneas) es el paso final del wizard de inventario
donde firman las partes. Tiene 4 bloques grandes:

| Sección                 | Líneas (aprox) | Tipo         |
| ----------------------- | -------------- | ------------ |
| Validators + constants  | ~50            | inline       |
| State + handlers        | ~140           | extraer hook |
| SignerCard (interno)    | ~110           | extraer      |
| LegalTextsCard          | ~80            | extraer      |
| SharePdfModal (interno) | ~130           | extraer      |
| Shell (JSX + banner)    | ~120           | inline       |

## 2. Estado objetivo

```
src/features/properties/components/
├── SignatureStep.tsx                              ~170  shell + orquestación
└── signatureStep/
    ├── useSignatureStep.ts                        ~150  state + handlers + validators
    ├── SignerCard.tsx                             ~110  card reutilizable por firmante
    ├── LegalTextsCard.tsx                         ~100  textos jurídicos + accept
    └── SharePdfModal.tsx                          ~140  modal para compartir PDF
```

**Total**: 631 → ~170 (SignatureStep) + 4 archivos entre 100-150 líneas.

## 3. Acceptance Criteria

### AC-1: 4 archivos nuevos en `src/features/properties/components/signatureStep/`

- `signatureStep/useSignatureStep.ts` ✓
- `signatureStep/SignerCard.tsx` ✓
- `signatureStep/LegalTextsCard.tsx` ✓
- `signatureStep/SharePdfModal.tsx` ✓

### AC-2: `SignatureStep.tsx` < 250 líneas

Reducción esperada: 631 → ~170 (-73%).

### AC-3: Cada archivo nuevo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: Sin cambios funcionales

- 2 SignerCards (arrendatario + agente) con sus fotos, datos, firmas
- Textos jurídicos con accept obligatorio
- Banner con motivos pendientes sigue apareciendo
- Botón "Guardar firmas" se habilita igual
- "Descargar PDF" / "Compartir PDF firmado" funcionan
