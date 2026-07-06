-- ============================================================================
-- 004 — invoice_number en rent_invoices
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

ALTER TABLE rent_invoices
  ADD COLUMN invoice_number VARCHAR(20) NULL AFTER id
    COMMENT 'Consecutivo visible CC-YYYYMM-NNN, generado al enviar la cuenta de cobro';

CREATE INDEX invoices_invoice_number_idx ON rent_invoices (invoice_number);