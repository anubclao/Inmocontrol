-- ============================================================================
-- 006 — property_charges (novedades de gastos / cargos)
-- ============================================================================
-- Modelo unificado para registrar cualquier novedad de gasto que afecte la
-- relación mensual entre propietario, inquilino e INMOVIRTUAL.
--
-- Por qué:
--   Antes existían DOS registros paralelos que nunca se hablaban:
--     1) property_discounts (form en BillingPanel → descuento al propietario,
--        aparecía en el estado de cuenta).
--     2) financial_records (form "Registro de Novedad Contable" en
--        FinancialView → autocompletaba gastosOperativos de la liquidación).
--   El mismo evento había que registrarlo en los dos lados para que apareciera
--   en ambos documentos, y no había forma de imputar cargos al inquilino en la
--   cuenta de cobro.
--
-- Esta tabla los reemplaza a ambos desde la perspectiva del módulo de
-- facturación. Se distinguen con `charged_to`:
--   - 'owner'  → descuenta del estado de cuenta del propietario.
--                Equivale al `property_discounts` viejo (backfill compatible).
--   - 'tenant' → se suma a la cuenta de cobro del inquilino del mes.
--                Equivale al típico "cargo al inquilino" (daño, mora extra, etc.).
--   - 'both'   → aparece en AMBOS lados (caso híbrido).
--
-- `applies_to_invoice` permite que un cargo quede registrado pero NO entre en
-- la cuenta de cobro (ej: predial del año cargado en enero, pero el contrato
-- inició en febrero → no aplica a la CC de febrero).
--
-- `property_discounts` se mantiene por compatibilidad histórica (no se borra).
-- `financial_records` queda como libreta contable aparte (no se toca).
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_charges (
  id                   CHAR(36)      NOT NULL,
  organization_id      CHAR(36)      NOT NULL,
  property_id          CHAR(36)      NOT NULL,
  -- Periodo al que aplica (YYYY-MM). Una novedad registrada tarde igual
  -- queda asociada al mes en que ocurrió, no al mes en que se tipeó.
  period               CHAR(7)       NOT NULL
                         COMMENT 'YYYY-MM — mes al que aplica el cargo',
  -- Tipo de novedad. Define el default de charged_to si el agente no lo
  -- modifica (reglas viven en src/features/billing/types.ts → defaultChargedToFor()).
  type                 ENUM(
                         'public_services',  -- servicios públicos
                         'maintenance',      -- arreglos locativos / mantenimiento general
                         'repair',           -- reparación imputable al inquilino (daño)
                         'tax',              -- impuestos (predial, etc.)
                         'insurance',        -- prima de póliza
                         'commission',       -- comisión adicional / ajuste
                         'parking',          -- parqueo adicional
                         'other'             -- otros
                       ) NOT NULL,
  description          VARCHAR(500)  NOT NULL,
  amount               DECIMAL(14,2) NOT NULL
                         COMMENT 'Monto en COP (pesos enteros, sin decimales)',
  -- A quién se le imputa el cargo. Ver bloque de comentarios arriba.
  charged_to           ENUM('owner','tenant','both') NOT NULL DEFAULT 'owner',
  -- Si true y charged_to IN ('tenant','both'), el monto se suma al
  -- subtotal de la cuenta de cobro del periodo. Si false, queda solo como
  -- registro histórico (ej: un cargo a un periodo ya cerrado).
  applies_to_invoice   TINYINT(1)    NOT NULL DEFAULT 1,
  attachment_url       VARCHAR(1000) NULL
                         COMMENT 'URL (Drive o blob:) del recibo/factura soporte',
  recorded_by          VARCHAR(150)  NOT NULL
                         COMMENT 'Nombre del agente que registró la novedad',
  recorded_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY charges_org_idx (organization_id),
  KEY charges_property_period_idx (property_id, period),
  KEY charges_type_idx (type),
  KEY charges_charged_to_idx (charged_to),
  CONSTRAINT fk_charges_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_charges_property
    FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Backfill desde property_discounts ─────────────────────────────────
-- Los descuentos registrados antes de esta migración eran SIEMPRE
-- descuentos al propietario (no había forma de imputar al inquilino).
-- Los movemos al nuevo modelo con charged_to='owner' así no se pierde
-- nada en los reportes.
--
-- El id original puede tener >36 chars (los DiscountFormModal viejos
-- usaban `disc-<timestamp>-<random>`). Convertimos a un UUID-like de 36
-- chars determinístico con MD5(d.id) formateado como UUID v5 (8-4-4-4-12).
--
-- Idempotente: solo inserta descuentos que aún no fueron migrados (compara
-- por description + amount + month_period + property_id).
INSERT INTO property_charges
  (id, organization_id, property_id, period, type, description, amount,
   charged_to, applies_to_invoice, attachment_url, recorded_by, recorded_at)
WITH src AS (
  SELECT
    d.organization_id, d.property_id, d.month_period, d.type, d.description,
    d.amount, d.attachment_url, d.recorded_by, d.recorded_at,
    MD5(d.id) AS md5_hex
  FROM property_discounts d
)
SELECT
  LOWER(CONCAT(
    SUBSTRING(md5_hex, 1, 8), '-',
    SUBSTRING(md5_hex, 9, 4), '-',
    SUBSTRING(md5_hex, 13, 4), '-',
    SUBSTRING(md5_hex, 17, 4), '-',
    SUBSTRING(md5_hex, 21, 12)
  ))                                                AS id,
  organization_id,
  property_id,
  month_period,
  type,
  description,
  amount,
  'owner'                                           AS charged_to,
  0                                                 AS applies_to_invoice,
  attachment_url,
  CONCAT('migrado desde property_discounts por ', recorded_by),
  recorded_at
FROM src
WHERE NOT EXISTS (
  SELECT 1 FROM property_charges c
  WHERE c.property_id = src.property_id
    AND c.period      = src.month_period
    AND c.description = src.description
    AND c.amount      = src.amount
);
