-- ============================================================================
-- 004 — invoice_number en rent_invoices (BUG-034: idempotente)
-- ============================================================================
-- Consecutivo de cuenta de cobro visible (formato CC-YYYYMM-NNN) que se
-- muestra en el PDF y permite trazabilidad contable. Es distinto al `id`
-- interno (UUID) — el `invoice_number` es el número que se imprime en la
-- cuenta de cobro y que el inquilino/proveedor ve.
--
-- Se genera automáticamente al "Enviar cuenta de cobro" desde el módulo
-- de finanzas (BillingPanel → AmortizationTable). Hasta entonces, la fila
-- queda NULL porque la cuenta aún no fue emitida.
--
-- El backend usa un contador por mes: cuenta cuántos invoices ya existen
-- para ese period + property, suma 1, y formatea como CC-YYYYMM-NNN.
-- Esto es compatible con multi-propiedad y multi-org.
--
-- Idempotente (jul-2026): si la columna o el índice ya existen, no
-- falla. Patrón pre-check con information_schema.
-- ============================================================================

-- 1. ¿La columna invoice_number ya existe?
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rent_invoices'
    AND COLUMN_NAME = 'invoice_number'
);

SET @sql_col := IF(
  @col_exists = 0,
  'ALTER TABLE rent_invoices ADD COLUMN invoice_number VARCHAR(20) NULL AFTER id COMMENT ''Consecutivo visible CC-YYYYMM-NNN, generado al enviar la cuenta de cobro''',
  'SELECT "BUG-034: rent_invoices.invoice_number ya existe, OK (idempotente)" AS info'
);

PREPARE stmt FROM @sql_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. ¿El índice invoices_invoice_number_idx ya existe?
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rent_invoices'
    AND INDEX_NAME = 'invoices_invoice_number_idx'
);

SET @sql_idx := IF(
  @idx_exists = 0,
  'CREATE INDEX invoices_invoice_number_idx ON rent_invoices (invoice_number)',
  'SELECT "BUG-034: invoices_invoice_number_idx ya existe, OK (idempotente)" AS info'
);

PREPARE stmt FROM @sql_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
