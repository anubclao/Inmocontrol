-- ============================================================================
-- 005 — owner_payouts (transferencias al propietario)
-- ============================================================================
-- Una "transferencia" es el dinero que INMOVIRTUAL le gira al propietario
-- del inmueble una vez cobrados los cánones, descontadas las comisiones y
-- gastos, y aplicadas las retenciones. Es la contraparte "real" del cálculo
-- teórico que hace `calculateMonthlySettlement` (LiquidacionMensual).
--
-- Por qué se diferencia del cálculo:
--   - El cálculo es PROYECTADO (lo que se debería transferir).
--   - El payout es REAL (lo que efectivamente se giró, con banco, fecha,
--     referencia, soporte).
-- En el estado de cuenta mensual se muestran AMBOS: el cálculo como
-- "Liquidación proyectada" (abono teórico) y los payouts reales como
-- "Transferencias realizadas" (abonos efectivos).
--
-- Esquema:
--   - Una fila por transferencia. Un mismo mes puede tener N payouts
--     (ej: el propietario pide 2 giros parciales, o se ajusta tras un
--     descuento que se知らなかった initially).
--   - `period` (YYYY-MM) es el mes al que aplica la transferencia (no
--     necesariamente el mes en que se hizo el giro — eso es `paid_at`).
--   - `bank_account_id` apunta a la cuenta del propietario donde se giró.
--   - `recorded_by` es el agente que registró el pago (trazabilidad).
--   - `reference` es el # de comprobante de la transferencia bancaria.

CREATE TABLE IF NOT EXISTS owner_payouts (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  contract_id     CHAR(36)      NULL
                    COMMENT 'NULL cuando la transferencia es por la propiedad completa (caso normal)',
  period          CHAR(7)       NOT NULL
                    COMMENT 'YYYY-MM — mes al que aplica la transferencia',
  amount          DECIMAL(14,2) NOT NULL
                    COMMENT 'Monto girado en COP al propietario',
  paid_at         DATETIME      NOT NULL
                    COMMENT 'Fecha real del giro (puede diferir del period si se hizo跨月)',
  bank_account_id CHAR(36)      NULL
                    COMMENT 'Cuenta destino del propietario (bank_accounts.id)',
  reference       VARCHAR(200)  NULL
                    COMMENT 'Referencia/comprobante de la transferencia bancaria',
  notes           TEXT          NULL
                    COMMENT 'Notas libres (ej: "Pago parcial — resto programado para día 20")',
  recorded_by     VARCHAR(150)  NOT NULL
                    COMMENT 'Nombre del agente que registró la transferencia',
  recorded_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY payouts_org_idx (organization_id),
  KEY payouts_property_period_idx (property_id, period),
  KEY payouts_contract_idx (contract_id),
  CONSTRAINT fk_payouts_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_payouts_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_payouts_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL,
  CONSTRAINT fk_payouts_bank_account FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;