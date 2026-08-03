# Fix: Duplicado en 006_*.sql (BUG-031)

> Karpathy Spec - Agosto 2026.
> Bug origen: BUG-031 en docs/bugs/BUGS.md. Severidad: Verde Bajo.

## User Story

Como dev, quiero que cada migration tenga un numero unico y secuencial.

## Contexto

db/mysql/migrations/ tiene:
- 006_password_hash.sql
- 006_property_charges.sql

Ambas con el mismo prefijo 006_. Si un script usa el numero para ordenar, no sabe cual va primero.

## Acceptance Criteria

### AC-1: Renombrar una a 011

- Renombrar 006_property_charges.sql a 011_property_charges.sql.
- Actualizar apply-006-charges-migration.mjs a apply-011-migration.mjs.
- Actualizar schema-completo.sql y schema-hostinger.sql.

### AC-2: O alternativa: sufijo 006a/006b

- 006a_password_hash.sql
- 006b_property_charges.sql

### AC-3: Verificacion

ls db/mysql/migrations/ debe mostrar numeros unicos.

## Effort

- Renombrar: 5 min.
- Actualizar scripts: 10 min.
- **Total: 15 min**

---

Pendiente de aprobacion del usuario.
