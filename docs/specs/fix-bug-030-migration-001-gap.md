# Fix: Gap inicial sin 001_*.sql (BUG-030)

> Karpathy Spec - Agosto 2026.
> Bug origen: BUG-030 en docs/bugs/BUGS.md. Severidad: Verde Bajo.

## User Story

Como dev de InmoControl, quiero que las migrations tengan numeracion consistente desde 001, para que sea facil entender el orden de aplicacion.

## Contexto

El primer "001" es db/mysql/schema.sql (sin sufijo de version), pero las demas migrations SI tienen el patron 00N_*.sql. Esto confunde al reader.

## Acceptance Criteria

### AC-1: Renumerar schema.sql a 000_initial_schema.sql

- git mv db/mysql/schema.sql db/mysql/000_initial_schema.sql.
- Actualizar todos los apply-XXX-migration.mjs que lo referencien.
- Actualizar AGENTS.md y DEPLOY.md.

### AC-2: O alternativa: dejar schema.sql y agregar nota

Agregar header con conteo de migration.

### AC-3: Verificacion de orden

ls db/mysql/*.sql | sort debe mostrar 000_initial_schema.sql primero.

## Effort

- Renombrar o documentar: 5 min.
- Busqueda de referencias y actualizacion: 15 min.
- **Total: 20 min**

---

Pendiente de aprobacion del usuario.
