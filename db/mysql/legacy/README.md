# `db/mysql/legacy/` — archivos archivados

> ⚠️ NO usar estos archivos para deploys nuevos.
> Para deploys en Hostinger (o cualquier MySQL 8 limpio) usar:
> [`db/mysql/schema-hostinger.sql`](../schema-hostinger.sql)
>
> Ver [BUG-027](../../docs/bugs/BUGS.md) y [BUG-030](../../docs/bugs/BUGS.md).

## ¿Qué hay acá?

| Archivo      | Por qué está acá                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema.sql` | Schema original (pre-Fase 2+). No tiene `inventory_*_pdf_url`, `property_owners/units`, `owner_payouts`, ni `status` en español. Si lo corrés en una DB limpia, la app explota con `ER_BAD_FIELD_ERROR` en la primera request. |

## ¿Por qué no borrarlo?

Lo movimos con `git mv` para preservar el historial. Si algún script viejo
lo referencia (ej. `align-schema-compat.mjs` lo menciona en un comment),
sigue funcionando por compat. Pero **NO es la fuente de verdad**.

## ¿Cómo sé cuál usar?

| Caso                                | Usar                                      |
| ----------------------------------- | ----------------------------------------- |
| Deploy fresh a Hostinger            | `schema-hostinger.sql` (canónico)         |
| Dev local limpio                    | `schema-hostinger.sql` (mismo)            |
| Tests E2E con DB semilla            | `seed-default-org.mjs` o `seed-pilot.mjs` |
| Quiero entender el schema histórico | `legacy/schema.sql` (solo lectura)        |
