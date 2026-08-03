# Fix: db/mysql/schema.sql obsoleto (BUG-027)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-027-schema-sql-legacy.md`.
>
> **Bug origen**: BUG-027 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `db/mysql/schema.sql`, `AGENTS.md`.

## 1. User Story

**As a** operador de InmoControl que arranca un deploy fresh,
**I want to** que el archivo `db/mysql/schema.sql` (el "default" que usa el
README) sea el schema canónico (con todas las columnas y tablas de Fase 2+),
**So that** un deploy desde cero no tire 500 con `ER_BAD_FIELD_ERROR` en
la primera request.

## 2. Contexto del bug

### Estado actual

`db/mysql/schema.sql` (el original, "limpio") tiene:
- ❌ Sin columnas `inventory_captacion_pdf_url` / `inventory_colocacion_pdf_url`
  en `properties`.
- ❌ Sin tablas `property_owners` / `property_units`.
- ❌ Sin tabla `owner_payouts`.
- ❌ `status` en inglés (no español).

`db/mysql/schema-completo.sql` y `db/mysql/schema-hostinger.sql` SÍ están
actualizados con Fase 2+. Son los que DEBERÍAN ser canónicos.

### Resultado

Si un nuevo dev/operador hace deploy fresh usando `schema.sql`:
1. La app arranca.
2. Primer GET /api/properties → MySQL tira `ER_BAD_FIELD_ERROR: Unknown column 'inventory_captacion_pdf_url'`.
3. Express devuelve 500.
4. Frontend tira `SyntaxError`.
5. El deploy está "vivo" pero la app no funciona.

## 3. Acceptance Criteria

### AC-1: Marcar `db/mysql/schema.sql` como legacy

- Mover a `db/mysql/legacy/schema.sql` (git mv, preserva history).
- Agregar `db/mysql/legacy/README.md` explicando que NO se debe usar.

### AC-2: Documentar canónico en AGENTS.md

- En la sección "Deploy a Hostinger (flujo limpio)", ya está bien apuntado
  a `db/mysql/schema-hostinger.sql`. Verificar que el AGENTS.md actual NO
  mencione `schema.sql` (sin sufijo) en el flujo recomendado.

### AC-3: Si NO mover (alternativa más segura)

- Si mover el archivo rompe scripts viejos (e.g. `apply-XXX-migration.mjs`
  que lo lee), alternativa: dejarlo donde está pero con un header de
  "DEPRECATED — use schema-hostinger.sql":
  ```sql
  -- ============================================================================
  -- DEPRECATED: Este schema NO incluye las tablas de Fase 2+ (property_owners,
  -- property_units, owner_payouts) ni las columnas inventory_*_pdf_url.
  -- Usar `schema-hostinger.sql` o `schema-completo.sql` para deploys fresh.
  -- Ver: docs/bugs/BUG-027
  -- ============================================================================
  ```

### AC-4: Tests de deploy fresh

- En un dev MySQL limpio, ejecutar `schema.sql` + levantar la app.
- **Verificar**: la app carga sin errores 500.

## 4. Edge Cases

### EC1: Scripts viejos referencian `schema.sql`

- Si `apply-XXX-migration.mjs` lo lee, agregar fallback a `schema-hostinger.sql`.
- Si no se usa, mover es seguro.

### EC2: `seed-default-org.mjs` o `seed-pilot.mjs` usan `schema.sql`

- Buscar referencias y actualizar.

### EC3: Documentación vieja menciona `schema.sql`

- Buscar en `README.md`, `DEPLOY.md`, `AGENTS.md` y reemplazar por
  `schema-hostinger.sql` (canónico para Hostinger).

## 5. Technical Contract

### Antes (engañoso)

```
$ ls db/mysql/*.sql
schema.sql                  ←，看上去 canónico, pero está VIEJO
schema-completo.sql         ← actualizado
schema-hostinger.sql        ← actualizado
```

### Después (explícito)

```
$ ls db/mysql/*.sql
schema-completo.sql         ← actualizado
schema-hostinger.sql        ← actualizado
legacy/
  schema.sql                ← DEPRECATED con header
  README.md                 ← explica por qué
```

## 6. Tostadas exactas (copy approved — NO improvisar)

(N/A — fix silencioso, sin cambios de UX)

## 7. Out of Scope

- Borrar completamente `schema.sql` (puede romper scripts viejos).
- Migrar datos del schema viejo al nuevo (es un fix de archivo, no de datos).

## 8. Dependencias

- `db/mysql/schema.sql` (mover o deprecar).
- `AGENTS.md` (verificar referencias).

## 9. Effort

- `git mv` o agregar header: 5 min.
- Búsqueda y reemplazo de referencias: 10 min.
- Test de deploy fresh: 15 min.
- **Total: 30 min**

---

**Pendiente de aprobación del usuario.**
