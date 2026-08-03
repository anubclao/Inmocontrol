-- ============================================================================
-- 012 — UNIQUE constraint en rent_invoices.invoice_number (BUG-032)
-- ============================================================================
-- El backend genera el consecutivo con un patrón `SELECT COUNT(*) + 1` que
-- no es atómico. Bajo concurrencia, dos POST /invoices/send simultáneos
-- pueden leer el mismo `n` y grabar el mismo `invoice_number`.
--
-- Defensa: agregar UNIQUE constraint. MySQL rechaza el 2do INSERT con
-- ER_DUP_ENTRY (1062) y el backend lo traduce a 409 al cliente.
--
-- Este script es IDEMPOTENTE:
--   1. Chequea si la constraint ya existe (en `information_schema`).
--   2. Chequea si hay duplicados existentes en la columna.
--   3. Si todo OK, agrega la constraint.
--   4. Si hay duplicados, falla con mensaje accionable (no se aplica).

-- 1. ¿Ya existe la constraint?
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rent_invoices'
    AND CONSTRAINT_NAME = 'uniq_invoice_number'
    AND CONSTRAINT_TYPE = 'UNIQUE'
);

-- 2. ¿Hay duplicados? (debería ser 0 si la app funcionó bien hasta ahora)
SET @dup_count = (
  SELECT COUNT(*) FROM (
    SELECT invoice_number, COUNT(*) AS n
    FROM rent_invoices
    WHERE invoice_number IS NOT NULL
    GROUP BY invoice_number
    HAVING n > 1
  ) AS d
);

-- 3. Aplicar solo si no existe Y no hay duplicados
SET @sql = IF(
  @constraint_exists = 0 AND @dup_count = 0,
  'ALTER TABLE rent_invoices ADD CONSTRAINT uniq_invoice_number UNIQUE (invoice_number)',
  IF(
    @constraint_exists > 0,
    'SELECT "BUG-032: uniq_invoice_number ya existe, OK (idempotente)" AS msg',
    CONCAT('SELECT "BUG-032: ABORT — hay ', @dup_count, ' invoice_number duplicados. Limpiá manualmente antes de aplicar la UNIQUE constraint" AS msg')
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
