# Fix #7: Refactor StepDocs.tsx (843 → <200 por archivo)

> **Severidad**: 🟠 P1. Stack: `src/features/properties/components/StepDocs.tsx`.

## AC-1: Estructura target

```
src/features/properties/components/StepDocs/
  index.tsx                             # shell ~150 líneas
  DocCard.tsx                           # <200 líneas
  modals/
    ConfirmContinueModal.tsx
    UploadAnotherDocModal.tsx
    IdNumberModal.tsx
  hooks/
    useDocCards.ts                      # buildRequiredSlots + iconForKey
```

## Effort

- 1 commit (~1h) — StepDocs es contenido del monolito PropertiesView, mejor hacerlo junto con #5 commit 2.

---

**Status:** ⏳ Pendiente.