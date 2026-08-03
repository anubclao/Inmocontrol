-- ============================================================================
-- 013 — UNIQUE constraint en tenants (organization_id, document_id) (BUG-033)
-- ============================================================================
-- Sin esta constraint, dos tenants con la misma cédula pueden coexistir en
-- la misma org. Esto rompe la búsqueda por documento y permite duplicados
-- accidentales al importar planillas.
--
-- Defensa: agregar UNIQUE constraint. MySQL rechaza el 2do INSERT con
-- ER_DUP_ENTRY (1062) y el backend lo traduce a 409 al cliente.
--
-- Este script es IDEMPOTENTE:
--   1. Chequea si la constraint ya existe (en `information_schema`).
--   2. Chequea si hay duplicados existentes en (org, document_id).
--   3. Si todo OK, agrega la constraint.
--   4. Si hay duplicados, falla con mensaje accionable (no se aplica).

-- 1. ¿Ya existe la constraint?
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tenants'
    AND CONSTRAINT_NAME = 'uniq_tenant_org_doc'
    AND CONSTRAINT_TYPE = 'UNIQUE'
);

-- 2. ¿Hay duplicados? (excluyendo NULL en document_id)
SET @dup_count = (
  SELECT COUNT(*) FROM (
    SELECT organization_id, document_id, COUNT(*) AS n
    FROM tenants
    WHERE document_id IS NOT NULL AND document_id <> ''
    GROUP BY organization_id, document_id
    HAVING n > 1
  ) AS d
);

-- 3. Aplicar solo si no existe Y no hay duplicados
SET @sql = IF(
  @constraint_exists = 0 AND @dup_count = 0,
  'ALTER TABLE tenants ADD CONSTRAINT uniq_tenant_org_doc UNIQUE (organization_id, document_id)',
  IF(
    @constraint_exists > 0,
    'SELECT "BUG-033: uniq_tenant_org_doc ya existe, OK (idempotente)" AS msg',
    CONCAT('SELECT "BUG-033: ABORT — hay ', @dup_count, ' tuplas (org, document_id) duplicadas. Limpiá manualmente antes de aplicar la UNIQUE constraint" AS msg')
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
