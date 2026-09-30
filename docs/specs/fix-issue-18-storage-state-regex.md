# Fix #18: getDocStorageState regex para query params

> **Severidad**: 🟡 P2. Stack: `src/features/properties/components/StepDocs.tsx:36-42`.

## AC-1: Regex matchea URLs con `?usp=drivesdk`

- Cambiar `/^https:\/\/(drive|docs)\.google\.com\//` por `/^https:\/\/(drive|docs)\.google\.com\//` con test del path antes del `?`.

## Effort

- 3 líneas, 0 deps.

---

**Status:** ⏳ Pendiente impl.