# Fix #24: handleFinalize skip ensurePropertyPersisted si ya persistido

> **Severidad**: 🟢 P3. Stack: `src/features/properties/PropertiesView.tsx:1322-1336`.

## AC-1: Si `wizardPropertyDbId` ya está set → skip el ensure

- El flow actual hace un fetch extra innecesario.

## Effort

- 5 líneas.

---

**Status:** ⏳ Pendiente impl.