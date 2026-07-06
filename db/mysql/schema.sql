-- ============================================================================
-- InmoControl — schema MySQL 8.0+
-- ============================================================================
-- Modelo completo de la base de datos de InmoControl, alineado 1:1 con los
-- tipos de `src/types/` y `src/features/billing/types.ts`.
--
-- Requisitos:
--   - MySQL 5.7+ / 8.0+ (check constraints enforced en 8.0.16+)
--   - InnoDB
--   - utf8mb4 / utf8mb4_unicode_ci (soporte completo para ñ, tildes, emojis)
--   - Parser de Workbench: el archivo está escrito en sintaxis compatible con
--     parsers antiguos (sin `DEFAULT (UUID())` ni precisión `DATETIME(N)`).
--     Si necesitas precisión de microsegundos, ajusta manualmente después.
--
-- Cómo aplicar:
--   mysql -u root -p < schema.sql
--   o desde un cliente: CREATE DATABASE inmocontrol; USE inmocontrol; <pegar>
--
-- Última actualización: 2026-06-17 (Fase A — modelo de billing)
--
-- NOTA sobre UUIDs:
--   MySQL Workbench (parser) NO acepta `DEFAULT (UUID())` aunque el servidor 8.0.13+
--   sí lo soporte. Por eso, todos los `id CHAR(36)` están SIN default — debes
--   generarlos en el INSERT:
--     INSERT INTO organizations (id, name) VALUES (UUID(), 'Demo');
--   La app de InmoControl ya genera UUIDs con `genId()` antes de enviar al backend.
-- ============================================================================

-- (Opcional, descomentar si arrancas desde cero)
-- DROP DATABASE IF EXISTS inmocontrol;
-- CREATE DATABASE inmocontrol
--   DEFAULT CHARACTER SET utf8mb4
--   DEFAULT COLLATE utf8mb4_unicode_ci;
-- USE inmocontrol;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 1. ORGANIZATIONS — multi-tenant
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id            CHAR(36)     NOT NULL,
  name          VARCHAR(200) NOT NULL,
  nit           VARCHAR(30)  NULL,
  address       VARCHAR(255) NULL,
  phone         VARCHAR(40)  NULL,
  website       VARCHAR(255) NULL,
  created_by    VARCHAR(36)  NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. PROFILES — usuarios vinculados a una org
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              CHAR(36)     NOT NULL,
  organization_id CHAR(36)     NOT NULL,
  display_name    VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL,
  role            VARCHAR(20)  NOT NULL DEFAULT 'admin'
                    CHECK (role IN ('admin', 'gestor', 'propietario', 'inquilino')),
  photo_url       VARCHAR(500) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY profiles_org_idx (organization_id),
  CONSTRAINT fk_profiles_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. PROPERTIES — inmuebles
-- ============================================================================
CREATE TABLE IF NOT EXISTS properties (
  id                CHAR(36)     NOT NULL,
  organization_id   CHAR(36)     NOT NULL,
  address           VARCHAR(255) NOT NULL,
  chip              VARCHAR(50)  NULL,
  folio             VARCHAR(50)  NULL,
  owner_name        VARCHAR(150) NOT NULL,
  owner_id_number   VARCHAR(30)  NULL,
  owner_phone       VARCHAR(40)  NULL,
  owner_email       VARCHAR(150) NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available', 'rented', 'maintenance', 'inactive')),
  -- Archivado (soft delete). Por defecto NO mostrar archivados en listas.
  archived          TINYINT(1)   NOT NULL DEFAULT 0,
  archived_at       DATETIME  NULL,
  archived_reason   VARCHAR(50)  NULL
                      CHECK (archived_reason IS NULL OR archived_reason IN ('cambio_propietario', 'fuera_agencia', 'otro')),
  -- Datos del contrato de mandato (URL del PDF firmado subido por el agente)
  mandato_pdf_url   VARCHAR(500) NULL,
  mandato_signed_at DATETIME  NULL,
  created_by        VARCHAR(36)  NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY properties_org_idx (organization_id),
  KEY properties_status_idx (status),
  KEY properties_archived_idx (archived),
  CONSTRAINT fk_properties_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. TENANTS — inquilinos
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id                  CHAR(36)     NOT NULL,
  organization_id     CHAR(36)     NOT NULL,
  property_id         CHAR(36)     NULL,
  name                VARCHAR(150) NOT NULL,
  document_id         VARCHAR(30)  NOT NULL,
  email               VARCHAR(150) NULL,
  phone               VARCHAR(40)  NULL,
  rent                DECIMAL(14,2) NULL,
  lease_start_date    DATE         NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  tenant_drive_folder_id VARCHAR(200) NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY tenants_org_idx (organization_id),
  KEY tenants_property_idx (property_id),
  KEY tenants_doc_idx (organization_id, document_id),
  CONSTRAINT fk_tenants_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_tenants_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. PROPERTY_DOCUMENTS — documentos legales subidos por el agente
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_documents (
  id            CHAR(36)     NOT NULL,
  property_id   CHAR(36)     NOT NULL,
  doc_type      VARCHAR(50)  NOT NULL
                  CHECK (doc_type IN ('cedula', 'certificado_tradicion', 'predial', 'rut', 'otro')),
  file_name     VARCHAR(255) NOT NULL,
  file_url      VARCHAR(500) NOT NULL,
  file_size     INT UNSIGNED NULL,
  uploaded_by   VARCHAR(36)  NULL,
  uploaded_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY prop_docs_property_idx (property_id),
  CONSTRAINT fk_prop_docs_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. CONTRACTS — contratos de arrendamiento
-- ============================================================================
CREATE TABLE IF NOT EXISTS contracts (
  id                     CHAR(36)      NOT NULL,
  organization_id        CHAR(36)      NOT NULL,
  property_id            CHAR(36)      NOT NULL,
  tenant_id              CHAR(36)      NULL,
  rent_amount            DECIMAL(14,2) NOT NULL,
  admin_fee              DECIMAL(14,2) NOT NULL DEFAULT 0,
  commission_pct         DECIMAL(5,2)  NOT NULL DEFAULT 8,
  insurance_pct          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  start_date             DATE          NOT NULL,
  end_date               DATE          NOT NULL,
  notice_date            DATE          NULL,
  status                 VARCHAR(20)   NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'active', 'expiring', 'expired', 'terminated')),
  renewal_strategy       VARCHAR(10)   NOT NULL DEFAULT 'manual'
                           CHECK (renewal_strategy IN ('auto', 'manual', 'none')),
  inventory_end_required TINYINT(1)    NOT NULL DEFAULT 1,
  notes                  TEXT          NULL,
  -- PDF del contrato firmado por las partes (subido por el agente)
  contract_pdf_url       VARCHAR(500)  NULL,
  signed_at              DATETIME   NULL,
  created_at             DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY contracts_org_idx (organization_id),
  KEY contracts_property_idx (property_id),
  KEY contracts_tenant_idx (tenant_id),
  KEY contracts_status_idx (status),
  CONSTRAINT fk_contracts_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_contracts_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_contracts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. INVENTORIES — inventarios inicial/final
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventories (
  id              CHAR(36)     NOT NULL,
  organization_id CHAR(36)     NOT NULL,
  property_id     CHAR(36)     NOT NULL,
  contract_id     CHAR(36)     NULL,
  phase           VARCHAR(10)  NOT NULL CHECK (phase IN ('inicial', 'final')),
  property_type   VARCHAR(30)  NOT NULL,
  counters        JSON         NOT NULL,
  areas           JSON         NOT NULL,
  photos          JSON         NOT NULL,
  signatures      JSON         NOT NULL,
  custom_areas    JSON         NULL,
  signed_at       DATETIME  NULL,
  created_by      VARCHAR(36)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_inventory_property_phase (property_id, phase),
  KEY inventories_org_idx (organization_id),
  CONSTRAINT fk_inventories_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventories_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventories_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. FINANCIAL_RECORDS — movimientos contables (recibos, pagos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_records (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  contract_id     CHAR(36)      NULL,
  property_id     CHAR(36)      NOT NULL,
  date            DATE          NOT NULL,
  type            VARCHAR(10)   NOT NULL CHECK (type IN ('income', 'expense')),
  category        VARCHAR(30)   NOT NULL
                    CHECK (category IN ('rent', 'admin_ph', 'maintenance', 'services', 'tax', 'bank_fee', 'commission', 'insurance')),
  description     VARCHAR(500)  NOT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  attachment_url  VARCHAR(500)  NULL,
  created_by      VARCHAR(36)   NULL,
  created_at      DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY finrec_org_idx (organization_id),
  KEY finrec_property_date_idx (property_id, date),
  KEY finrec_contract_idx (contract_id),
  CONSTRAINT fk_finrec_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_finrec_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_finrec_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. BANK_ACCOUNTS — cuentas bancarias (parametrizables por propiedad)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id            CHAR(36)     NOT NULL,
  organization_id CHAR(36)  NOT NULL,
  property_id   CHAR(36)     NULL,        -- NULL = disponible para todas las propiedades de la org
  bank          VARCHAR(100) NOT NULL,
  account_type  VARCHAR(20)  NOT NULL CHECK (account_type IN ('savings', 'checking')),
  account_number VARCHAR(50) NOT NULL,
  holder_name   VARCHAR(150) NOT NULL,
  holder_id_number VARCHAR(30) NOT NULL,
  is_primary    TINYINT(1)  NOT NULL DEFAULT 0,
  notes         TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY bank_accounts_org_idx (organization_id),
  KEY bank_accounts_property_idx (property_id),
  CONSTRAINT fk_bank_accounts_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_bank_accounts_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 10. POLICIES — pólizas de seguro (vinculadas a una BillingPolicy)
-- ============================================================================
CREATE TABLE IF NOT EXISTS policies (
  id                  CHAR(36)      NOT NULL,
  organization_id     CHAR(36)      NOT NULL,
  property_id         CHAR(36)      NOT NULL,
  insurer             VARCHAR(150)  NOT NULL,
  policy_number       VARCHAR(100)  NOT NULL,
  start_date          DATE          NOT NULL,
  end_date            DATE          NOT NULL,
  premium_amount      DECIMAL(14,2) NOT NULL,
  approval_pdf_url    VARCHAR(500)  NULL,
  approved_at         DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by         VARCHAR(150)  NOT NULL,
  notes               TEXT          NULL,
  created_at          DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY policies_org_idx (organization_id),
  KEY policies_property_idx (property_id),
  UNIQUE KEY uniq_policy_number (policy_number),
  CONSTRAINT fk_policies_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_policies_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 11. BILLING_POLICIES — parametrización de facturación por propiedad
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_policies (
  property_id              CHAR(36)      NOT NULL,
  organization_id          CHAR(36)      NOT NULL,
  rent_amount              DECIMAL(14,2) NOT NULL,
  admin_fee                DECIMAL(14,2) NOT NULL DEFAULT 0,
  late_fee_mid_pct         DECIMAL(5,2)  NOT NULL DEFAULT 5,
  late_fee_late_pct        DECIMAL(5,2)  NOT NULL DEFAULT 10,
  grace_day                TINYINT       NOT NULL DEFAULT 10,
  apply_annual_ipc        TINYINT(1)    NOT NULL DEFAULT 1,
  expected_ipc_pct         DECIMAL(5,2)  NOT NULL DEFAULT 0,
  apply_ipc_to_admin       TINYINT(1)    NOT NULL DEFAULT 1,
  allow_admin_changes      TINYINT(1)    NOT NULL DEFAULT 1,
  primary_bank_account_id  CHAR(36)      NULL,
  policy_id                CHAR(36)      NULL,
  created_at               DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by               VARCHAR(150)  NOT NULL,
  PRIMARY KEY (property_id),
  KEY billing_policies_org_idx (organization_id),
  KEY billing_policies_primary_bank_idx (primary_bank_account_id),
  KEY billing_policies_policy_idx (policy_id),
  CONSTRAINT fk_billing_policies_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policies_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policies_bank FOREIGN KEY (primary_bank_account_id) REFERENCES bank_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_policies_policy FOREIGN KEY (policy_id) REFERENCES policies (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 12. AMORTIZATION_ROWS — filas de la tabla de amortización
-- ============================================================================
CREATE TABLE IF NOT EXISTS amortization_rows (
  id                    CHAR(36)      NOT NULL,
  organization_id       CHAR(36)      NOT NULL,
  property_id           CHAR(36)      NOT NULL,
  contract_id           CHAR(36)      NOT NULL,
  month_number          INT UNSIGNED  NOT NULL,
  period_start          DATE          NOT NULL,
  period_end            DATE          NOT NULL,
  due_date              DATE          NOT NULL,
  base_rent             DECIMAL(14,2) NOT NULL,
  base_admin            DECIMAL(14,2) NOT NULL,
  admin_adjustment      DECIMAL(14,2) NOT NULL DEFAULT 0,
  ipc_adjustment        DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal              DECIMAL(14,2) NOT NULL,
  applied_late_fee_pct  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  late_fee_amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_on_day_of_month  TINYINT       NULL,
  total                 DECIMAL(14,2) NOT NULL,
  total_early           DECIMAL(14,2) NOT NULL,
  total_mid             DECIMAL(14,2) NOT NULL,
  total_late            DECIMAL(14,2) NOT NULL,
  status                VARCHAR(20)   NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  paid_at               DATETIME   NULL,
  paid_amount           DECIMAL(14,2) NULL,
  created_at            DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_amort_contract_month (contract_id, month_number),
  KEY amort_contract_idx (contract_id),
  KEY amort_property_period_idx (property_id, period_start),
  KEY amort_org_idx (organization_id),
  CONSTRAINT fk_amort_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_amort_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_amort_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 13. PROPERTY_DISCOUNTS — descuentos al propietario
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_discounts (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  type            VARCHAR(30)   NOT NULL
                    CHECK (type IN ('public_services', 'maintenance', 'tax', 'insurance', 'commission', 'other')),
  description     VARCHAR(500)  NOT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  month_period    CHAR(7)       NOT NULL COMMENT 'YYYY-MM',
  attachment_url  VARCHAR(500)  NULL,
  recorded_at     DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by     VARCHAR(150)  NOT NULL,
  PRIMARY KEY (id),
  KEY discounts_org_idx (organization_id),
  KEY discounts_property_period_idx (property_id, month_period),
  CONSTRAINT fk_discounts_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_discounts_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 14. RENT_INCREASES — aumentos al inquilino
-- ============================================================================
CREATE TABLE IF NOT EXISTS rent_increases (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  contract_id     CHAR(36)      NOT NULL,
  type            VARCHAR(20)   NOT NULL
                    CHECK (type IN ('admin_change', 'ipc_annual')),
  description     VARCHAR(500)  NOT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  effective_from  CHAR(7)       NOT NULL COMMENT 'YYYY-MM desde cuando aplica',
  recorded_at     DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by     VARCHAR(150)  NOT NULL,
  PRIMARY KEY (id),
  KEY increases_org_idx (organization_id),
  KEY increases_property_idx (property_id),
  KEY increases_contract_effective_idx (contract_id, effective_from),
  CONSTRAINT fk_increases_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_increases_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_increases_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 15. RENT_INVOICES — cuentas de cobro al inquilino
-- ============================================================================
CREATE TABLE IF NOT EXISTS rent_invoices (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  contract_id     CHAR(36)      NOT NULL,
  period          CHAR(7)       NOT NULL COMMENT 'YYYY-MM',
  due_date        DATE          NOT NULL,
  subtotal        DECIMAL(14,2) NOT NULL,
  total_early     DECIMAL(14,2) NOT NULL,
  total_mid       DECIMAL(14,2) NOT NULL,
  total_late      DECIMAL(14,2) NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
  sent_at         DATETIME   NULL,
  paid_at         DATETIME   NULL,
  paid_amount     DECIMAL(14,2) NULL,
  payment_link    VARCHAR(500)  NULL,
  notes           TEXT          NULL,
  created_at      DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_invoice_contract_period (contract_id, period),
  KEY invoices_org_idx (organization_id),
  KEY invoices_property_period_idx (property_id, period),
  CONSTRAINT fk_invoices_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 16. PROPERTY_ACTIONS — log histórico append-only
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_actions (
  id            CHAR(36)     NOT NULL,
  organization_id CHAR(36)  NOT NULL,
  property_id   CHAR(36)     NOT NULL,
  type          VARCHAR(50)  NOT NULL
                  CHECK (type IN (
                    'property_created', 'property_archived', 'property_restored', 'property_owner_changed',
                    'documents_uploaded', 'mandato_signed', 'inventory_initial_signed', 'inventory_final_signed',
                    'contract_created', 'contract_signed', 'policy_approved',
                    'tenant_assigned', 'tenant_changed',
                    'payment_received', 'discount_registered', 'increase_registered',
                    'invoice_sent', 'invoice_paid', 'billing_policy_updated',
                    'bank_account_added', 'property_returned', 'note_added'
                  )),
  description   VARCHAR(500) NOT NULL,
  payload       JSON         NULL,
  actor_name    VARCHAR(150) NOT NULL,
  occurred_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY actions_property_time_idx (property_id, occurred_at),
  KEY actions_org_idx (organization_id),
  KEY actions_type_idx (type),
  CONSTRAINT fk_actions_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_actions_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Datos mínimos de demo (opcional, comentar si no se quiere)
-- ============================================================================
-- IMPORTANTE: aquí NO usamos DEFAULT en id, así que hay que generar UUIDs explícitos.
--   Descomentar solo si quieres datos de demo. Para pruebas reales, usa el seed en JS.

-- INSERT INTO organizations (id, name, nit) VALUES
--   (UUID(), 'InmoControl Demo', '900.123.456-7');

-- INSERT INTO properties (id, organization_id, address, chip, owner_name, owner_id_number, status)
--   SELECT UUID(), id, 'Calle 100 # 15-20, Apto 502', 'AAA0148XYZ',
--          'Carlos Ramírez', '79.123.456', 'rented'
--     FROM organizations WHERE name = 'InmoControl Demo' LIMIT 1;

-- ============================================================================
-- Verificación rápida
-- ============================================================================
SELECT 'InmoControl DB lista' AS status;
SELECT TABLE_NAME, TABLE_ROWS
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
  ORDER BY TABLE_NAME;


-- ─────────────────────────────────────────────────────────────────────────
-- GOOGLE OAUTH TOKENS — tokens OAuth por usuario (almacenados en Drive del usuario)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id                CHAR(36)    NOT NULL,
  user_id          VARCHAR(150) NOT NULL,          -- identifier del usuario en la app
  provider          VARCHAR(20) NOT NULL DEFAULT 'google_drive',
  access_token     TEXT        NULL,              -- nunca se expone al frontend
  refresh_token     TEXT        NULL,             -- para renovar sin re-autenticar
  expiry_date      BIGINT      NULL,             -- timestamp ms cuando expira el access_token
  drive_folder_id  VARCHAR(200) NULL,            -- ID de la carpeta "InmoControl" en su Drive
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY user_oauth_user_provider_idx (user_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 21. SAAS BILLING (Fase 8) — planes, subscripciones, métodos de pago, facturas
-- ============================================================================
-- NO confundir con el billing de PROPIEDADES (arriendos). Esto es la
-- subscripción de la ORGANIZACIÓN al SaaS InmoControl. Ver migración
-- 003_saas_billing.sql para detalle de columnas.

CREATE TABLE IF NOT EXISTS saas_plans (
  id                  CHAR(36)      NOT NULL,
  slug                VARCHAR(50)   NOT NULL,
  name                VARCHAR(100)  NOT NULL,
  description         VARCHAR(500)  NULL,
  price_cop           DECIMAL(14,0) NOT NULL DEFAULT 0,
  max_properties      INT           NOT NULL DEFAULT 5,
  max_users           INT           NOT NULL DEFAULT 1,
  max_alerts_per_month INT          NOT NULL DEFAULT 100,
  features_json       JSON          NULL,
  sort_order          INT           NOT NULL DEFAULT 100,
  is_active           TINYINT(1)    NOT NULL DEFAULT 1,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_plans_slug (slug),
  KEY plans_active_idx (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id                    CHAR(36)      NOT NULL,
  organization_id       CHAR(36)      NOT NULL,
  plan_id               CHAR(36)      NOT NULL,
  status                VARCHAR(20)   NOT NULL DEFAULT 'active'
                          CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  current_period_start  DATE          NOT NULL,
  current_period_end    DATE          NOT NULL,
  cancel_at_period_end  TINYINT(1)    NOT NULL DEFAULT 0,
  started_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  canceled_at           DATETIME      NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_subscription_org (organization_id),
  KEY subscription_plan_idx (plan_id),
  KEY subscription_status_idx (status),
  CONSTRAINT fk_subscription_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id) REFERENCES saas_plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saas_payment_methods (
  id                CHAR(36)      NOT NULL,
  organization_id   CHAR(36)      NOT NULL,
  type              VARCHAR(20)   NOT NULL DEFAULT 'card'
                      CHECK (type IN ('card', 'pse', 'nequi', 'bancolombia')),
  brand             VARCHAR(20)   NULL,
  last4             CHAR(4)       NULL,
  expiry_month      TINYINT       NULL,
  expiry_year       SMALLINT      NULL,
  holder_name       VARCHAR(150)  NULL,
  details_json      JSON          NULL,
  is_default        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY pm_org_idx (organization_id),
  CONSTRAINT fk_pm_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saas_invoices (
  id                  CHAR(36)      NOT NULL,
  organization_id     CHAR(36)      NOT NULL,
  subscription_id     CHAR(36)      NOT NULL,
  payment_method_id   CHAR(36)      NULL,
  invoice_number      VARCHAR(30)   NOT NULL,
  period_start        DATE          NOT NULL,
  period_end          DATE          NOT NULL,
  subtotal_cop        DECIMAL(14,0) NOT NULL,
  iva_cop             DECIMAL(14,0) NOT NULL,
  total_cop           DECIMAL(14,0) NOT NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'paid', 'void', 'uncollectible')),
  issued_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at             DATETIME      NULL,
  plan_snapshot_json  JSON          NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_invoice_number (invoice_number),
  KEY si_org_idx (organization_id),
  KEY si_subscription_idx (subscription_id),
  KEY si_status_idx (status),
  CONSTRAINT fk_si_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_si_subscription FOREIGN KEY (subscription_id) REFERENCES saas_subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT fk_si_payment_method FOREIGN KEY (payment_method_id) REFERENCES saas_payment_methods (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
