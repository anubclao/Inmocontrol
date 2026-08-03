# Fix: ensureDefaultOrg() fuera del try en inventories.ts (BUG-013)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> **STATUS: YA RESUELTO** por BUG-029 (commit 11c49f6). Este spec queda
> como evidencia de la revisión y para que el catálogo refleje el estado real.
>
> **Bug origen**: BUG-013 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad original**: 🟡 Media.
> **Stack afectado**: `server/routes/inventories.ts`.

## 1. Revisión

### Estado actual (post BUG-029)

Único `ensureDefaultOrg()` en inventories.ts está en `POST /api/inventories`
(línea 141), que fue migrado a `asyncHandler` en el commit `11c49f6`
(parte de BUG-029). El error de `ensureDefaultOrg()` se propaga al
middleware central `errorHandler.ts` y devuelve JSON 500.

### Antes de BUG-029

El patrón era:

```ts
router.post("/", async (req, res) => {
  const orgId = await ensureDefaultOrg();   // ← FUERA del try
  try { ... }
});
```

Después de BUG-029:

```ts
router.post(
  "/",
  asyncHandler(async (req, res) => {
    // validaciones inline
    const orgId = await ensureDefaultOrg(); // ← DENTRO del asyncHandler
    // ... resto del handler ...
  }),
);
```

## 2. Conclusión

**No requiere cambios adicionales.** El spec se archivó para mantener
trazabilidad y para que el catálogo de bugs refleje que la verificación
se hizo (en vez de quedar como "pendiente" eternamente).

## 3. Si en el futuro aparece otro endpoint con este patrón

Aplicar el patrón de BUG-029: envolver el handler con `asyncHandler` de
`server/lib/asyncHandler.ts`. Migración gradual, sin prisa.

## 4. Verificación rápida

```powershell
# Buscar ensureDefaultOrg en inventories.ts
grep_search("ensureDefaultOrg", "server/routes/inventories.ts")
# Debería aparecer solo 1 vez (la línea 141, dentro de asyncHandler)
```

---

**STATUS: ✅ YA RESUELTO POR BUG-029.**
