-- ============================================================================
-- 012 — UNIQUE constraint en rent_invoices (BUG-007 + BUG-032)
-- ============================================================================
-- BUG-007: el backend genera el consecutivo CC-YYYYMM-NNN con un patrón
-- `SELECT COUNT(*) + 1` que no es atómico. Bajo concurrencia, dos POST
-- /invoices/send simultáneos pueden leer el mismo `n` y grabar el mismo
-- `invoice_number`.
--
-- BUG-032: también pide UNIQUE constraint como defensa.
--
-- Solución combinada (per spec docs/specs/fix-bug-007-invoice-number-race.md):
-- UNIQUE constraint COMPUESTO en (organization_id, property_id, period,
-- invoice_number). Esto permite que el mismo `invoice_number` exista para
-- diferentes propiedades/meses (cada property tiene su propio contador),
-- pero rechaza duplicados dentro de la misma (org, prop, period).
--
-- NO usamos UNIQUE solo en `invoice_number` porque sería demasiado
-- restrictivo: propiedad A con CC-202607-001 impediría que propiedad B
-- también tenga CC-202607-001.
--
-- MySQL trata NULL como distinto en UNIQUE (NULL != NULL), por lo que las
-- filas con `invoice_number` NULL (pre-migration 004) no se ven afectadas.
--
-- Este script es IDEMPOTENTE:
--   1. Chequea si la constraint ya existe.
--   2. Chequea si hay duplicados existentes en la tupla completa.
--   3. Si todo OK, agrega la constraint.
--   4. Si hay duplicados, falla con mensaje accionable (no se aplica).

-- 1. ¿Ya existe la constraint?
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rent_invoices'
    AND CONSTRAINT_NAME = 'uniq_invoice_org_prop_period_number'
    AND CONSTRAINT_TYPE = 'UNIQUE'
);

-- 2. ¿Hay duplicados en la tupla completa?
SET @dup_count = (
  SELECT COUNT(*) FROM (
    SELECT organization_id, property_id, period, invoice_number, COUNT(*) AS n
    FROM rent_invoices
    WHERE invoice_number IS NOT NULL
    GROUP BY organization_id, property_id, period, invoice_number
    HAVING n > 1
  ) AS d
);

-- 3. Aplicar solo si no existe Y no hay duplicados
SET @sql = IF(
  @constraint_exists = 0 AND @dup_count = 0,
  'ALTER TABLE rent_invoices ADD CONSTRAINT uniq_invoice_org_prop_period_number UNIQUE (organization_id, property_id, period, invoice_number)',
  IF(
    @constraint_exists > 0,
    'SELECT "BUG-007/032: uniq_invoice_org_prop_period_number ya existe, OK (idempotente)" AS msg',
    CONCAT('SELECT "BUG-007/032: ABORT — hay ', @dup_count, ' tuplas (org, property, period, invoice_number) duplicadas. Limpiá manualmente antes de aplicar la UNIQUE constraint" AS msg')
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
