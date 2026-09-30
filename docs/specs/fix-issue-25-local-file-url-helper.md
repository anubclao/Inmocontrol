# Fix #25: Helper `isLocalFileUrl`

> **Severidad**: 🟢 P3. Stack: `src/features/properties/PropertiesView.tsx:2288-2294`.

## AC-1: Helper centralizado en `src/shared/lib/url.ts`

- Cubre `blob:`, `data:`, rutas locales (`/api/...`).
- Reemplazar las comparaciones inline.

## Effort

- 5 líneas + N call sites.

---

**Status:** ⏳ Pendiente impl.