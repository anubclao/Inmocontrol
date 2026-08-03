-- ============================================================================
-- InmoControl — SCHEMA COMPLETO CONSOLIDADO (MySQL 8.0+)
-- ============================================================================
-- Este archivo es el PUNTO DE PARTIDA único para un deploy limpio. Incluye
-- TODAS las tablas de InmoControl en su versión final, consolidando:
--
--   • schema.sql (modelo base — tablas 1-17 + saas_*)
--   • migración 002 (status en español para properties)
--   • migración 003 (SaaS billing — ya consolidada en schema.sql)
--   • migración 004 (rent_invoices.invoice_number + índice)
--   • migración 005 (tabla owner_payouts)
--
-- Cómo aplicar (entorno limpio):
--   mysql -u root -p < db/mysql/schema-completo.sql
--
-- O desde cliente:
--   CREATE DATABASE inmocontrol;
--   USE inmocontrol;
--   -- pegar el contenido de este archivo
--
-- Requisitos:
--   - MySQL 8.0+ (check constraints enforced desde 8.0.16)
--   - InnoDB
--   - utf8mb4 / utf8mb4_unicode_ci
--
-- IMPORTANTE — IDEMPOTENCIA:
--   Todo está escrito con `IF NOT EXISTS` y `DROP ... IF EXISTS` donde hace
--   falta, así que este script es seguro de correr múltiples veces sin
--   romper nada. Los CHECK constraints se recrean con el nombre canónico
--   para que las migraciones futuras los puedan dropear de forma estable.
--
-- IMPORTANTE — NO HAY OBJETOS AVANZADOS:
--   Este schema NO incluye vistas, triggers, stored procedures ni funciones.
--   La lógica vive 100% en TypeScript (cálculos financieros, validaciones)
--   con el server Express como capa fina de persistencia. Si en el futuro
--   se necesitan objetos avanzados, se agregan con migraciones incrementales
--   siguiendo el patrón `db/mysql/migrations/NNN_descripcion.sql`.
--
-- Última consolidación: 2026-07-02
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
  -- Password para el login del piloto. bcrypt (factor 10). NULL = sin password (legacy).
  -- Cuando se migre a SaaS multi-tenant, esta columna se depreca y se usa OAuth.
  password_hash   VARCHAR(255) NULL
                    COMMENT 'bcrypt hash del password. NULL = sin password (legacy OAuth users)',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      VARCHAR(36)  NULL,
  PRIMARY KEY (id),
  KEY profiles_org_idx (organization_id),
  CONSTRAINT fk_profiles_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. PROPERTIES — inmuebles
-- ============================================================================
-- Status canónico en ESPAÑOL (consistente con AGENTS.md "Schema importante
-- de `properties.status`"). Los valores legacy en inglés (available, rented,
-- maintenance, inactive) ya NO se aceptan — si hay datos legacy, ejecutar
-- el UPDATE de normalización antes de cargar este schema.
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
  property_type     VARCHAR(30)  NULL,        -- 'apartamento' | 'casa' | 'apartaestudio' | 'oficina' | 'local' | 'bodega'
  status            VARCHAR(20)  NOT NULL DEFAULT 'Pendiente'
                      CHECK (status IN ('Pendiente', 'Activo', 'En Colocación', 'Arrendado', 'Inactivo')),
  -- Archivado (soft delete). Por defecto NO mostrar archivados en listas.
  archived          TINYINT(1)   NOT NULL DEFAULT 0,
  archived_at       DATETIME  NULL,
  archived_reason   VARCHAR(50)  NULL
                      CHECK (archived_reason IS NULL OR archived_reason IN ('cambio_propietario', 'fuera_agencia', 'otro')),
  -- Datos del contrato de mandato (URL del PDF firmado subido por el agente)
  mandato_pdf_url   VARCHAR(500) NULL,
  mandato_signed_at DATETIME  NULL,
  -- Google Drive (opcional)
  drive_folder_id   VARCHAR(200) NULL,
  drive_folder_path VARCHAR(500) NULL,
  -- PDFs de inventarios firmados (uno por fase del wizard).
  -- `inventory_pdf_url` queda como legacy/compat — los nuevos uploads
  -- escriben en la columna específica según la fase (migración 009).
  inventory_pdf_url            VARCHAR(500) NULL,
  inventory_captacion_pdf_url  VARCHAR(500) NULL
                                  COMMENT 'PDF del Inventario de Captación (firmado por propietario)',
  inventory_colocacion_pdf_url VARCHAR(500) NULL
                                  COMMENT 'PDF del Inventario de Colocación (firmado por arrendatario + agente)',
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
  admin_fee           DECIMAL(14,2) NULL,
  lease_start_date    DATE         NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  tenant_drive_folder_id VARCHAR(200) NULL,
  drive_folder_path    VARCHAR(500) NULL
                          COMMENT 'Path legible de la carpeta del tenant en Drive',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY tenants_org_idx (organization_id),
  KEY tenants_property_idx (property_id),
  -- BUG-033: UNIQUE constraint evita duplicados de (org, document_id).
  -- Migration 013 aplica lo mismo en DBs existentes.
  UNIQUE KEY uniq_tenant_org_doc (organization_id, document_id),
  KEY tenants_doc_idx (organization_id, document_id),
  CONSTRAINT fk_tenants_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_tenants_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5.1 PROPERTY_OWNERS — N propietarios por propiedad (migración 010)
-- ============================================================================
-- El campo legacy `properties.owner_name` queda por compat (representa al
-- "primer" propietario = position=1). En pantallas nuevas se itera esta tabla.
-- El Contrato de Mandato sigue siendo 1 PDF multi-firmado por todos (vive en
-- `properties.mandato_pdf_url`, no se mueve a property_documents).
CREATE TABLE IF NOT EXISTS property_owners (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  name            VARCHAR(150)  NOT NULL,
  id_number       VARCHAR(30)   NULL
                    COMMENT 'Cédula del propietario. NULL si no se ingresó aún.',
  phone           VARCHAR(40)   NULL,
  email           VARCHAR(150)  NULL,
  ownership_pct   DECIMAL(5,2)  NULL
                    COMMENT 'Porcentaje de participación (0.00-100.00). NULL = sin definir.',
  position        INT           NOT NULL DEFAULT 1
                    COMMENT 'Posición 1 = primer propietario (principal en pantallas legacy).',
  notes           TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY property_owners_property_idx (property_id),
  KEY property_owners_org_idx (organization_id),
  CONSTRAINT fk_property_owners_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_property_owners_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5.2 PROPERTY_UNITS — unidades adicionales (garaje, depósito, etc.) (migración 010)
-- ============================================================================
-- NO se crea fila para la unidad principal: la principal es la propiedad
-- misma y sus docs (Certificado de Tradición principal) tienen unit_id=NULL.
-- Solo las unidades adicionales (parking, storage, other) tienen fila acá.
CREATE TABLE IF NOT EXISTS property_units (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  type            VARCHAR(30)   NOT NULL
                    COMMENT 'parking (garaje) | storage (depósito) | other',
  label           VARCHAR(100)  NOT NULL
                    COMMENT 'Etiqueta legible: "Garaje 12", "Depósito 3B", etc.',
  folio_matricula VARCHAR(50)   NULL
                    COMMENT 'Folio de matrícula inmobiliario de esta unidad.',
  area_m2         DECIMAL(10,2) NULL
                    COMMENT 'Área en m² (si aplica).',
  notes           TEXT          NULL,
  position        INT           NOT NULL DEFAULT 1
                    COMMENT 'Orden de visualización.',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY property_units_property_idx (property_id),
  KEY property_units_org_idx (organization_id),
  CONSTRAINT fk_property_units_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_property_units_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. PROPERTY_DOCUMENTS — documentos legales subidos por el agente
-- ============================================================================
-- owner_id y unit_id (migración 010) permiten vincular el documento a un
-- propietario específico o a una unidad adicional (garaje, depósito).
-- NULL = no aplica (ej: Predial de la propiedad, Certificado de la unidad
-- principal, o docs del Mandato — que sigue viviendo en properties.mandato_pdf_url).
CREATE TABLE IF NOT EXISTS property_documents (
  id            CHAR(36)     NOT NULL,
  property_id   CHAR(36)     NOT NULL,
  owner_id      CHAR(36)     NULL
                  COMMENT 'FK a property_owners. NULL si el doc NO es de un dueño específico (ej: Predial de la propiedad).',
  unit_id       CHAR(36)     NULL
                  COMMENT 'FK a property_units. NULL para la unidad principal o para docs no asociados a una unidad.',
  doc_type      VARCHAR(50)  NOT NULL
                  CHECK (doc_type IN ('cedula', 'certificado_tradicion', 'predial', 'rut', 'otro')),
  file_name     VARCHAR(255) NOT NULL,
  file_url      VARCHAR(500) NOT NULL,
  file_size     INT UNSIGNED NULL,
  uploaded_by   VARCHAR(36)  NULL,
  uploaded_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY prop_docs_property_idx (property_id),
  KEY prop_docs_owner_idx (owner_id),
  KEY prop_docs_unit_idx (unit_id),
  CONSTRAINT fk_prop_docs_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_prop_docs_owner    FOREIGN KEY (owner_id)     REFERENCES property_owners (id) ON DELETE CASCADE,
  CONSTRAINT fk_prop_docs_unit     FOREIGN KEY (unit_id)      REFERENCES property_units  (id) ON DELETE CASCADE
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
  contract_pdf_url       VARCHAR(500)  NULL,
  signed_at              DATETIME      NULL,
  created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by             VARCHAR(36)   NULL,
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
  signed_at       DATETIME      NULL,
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
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  id                CHAR(36)     NOT NULL,
  organization_id   CHAR(36)     NOT NULL,
  property_id       CHAR(36)     NULL,        -- NULL = disponible para todas las propiedades de la org
  bank              VARCHAR(100) NOT NULL,
  account_type      VARCHAR(20)  NOT NULL CHECK (account_type IN ('savings', 'checking')),
  account_number    VARCHAR(50)  NOT NULL,
  holder_name       VARCHAR(150) NOT NULL,
  holder_id_number  VARCHAR(30)  NOT NULL,
  is_primary        TINYINT(1)   NOT NULL DEFAULT 0,
  notes             TEXT         NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  approved_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by         VARCHAR(150)  NOT NULL,
  notes               TEXT          NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  created_by               VARCHAR(150)  NOT NULL,
  created_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (property_id),
  KEY billing_policies_org_idx (organization_id),
  CONSTRAINT fk_billing_policies_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policies_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 12. AMORTIZATION_ROWS — filas de la tabla de amortización
-- ============================================================================
CREATE TABLE IF NOT EXISTS amortization_rows (
  id                   CHAR(36)      NOT NULL,
  organization_id      CHAR(36)      NOT NULL,
  property_id          CHAR(36)      NOT NULL,
  contract_id          CHAR(36)      NOT NULL,
  month_number         INT           NOT NULL,
  period_start         DATE          NOT NULL,
  period_end           DATE          NOT NULL,
  due_date             DATE          NOT NULL,
  base_rent            DECIMAL(14,2) NOT NULL DEFAULT 0,
  base_admin           DECIMAL(14,2) NOT NULL DEFAULT 0,
  admin_adjustment     DECIMAL(14,2) NOT NULL DEFAULT 0,
  ipc_adjustment       DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal             DECIMAL(14,2) NOT NULL,
  applied_late_fee_pct DECIMAL(5,2)  NOT NULL DEFAULT 0,
  late_fee_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_on_day_of_month TINYINT       NULL,
  total                DECIMAL(14,2) NOT NULL,
  total_early          DECIMAL(14,2) NOT NULL,
  total_mid            DECIMAL(14,2) NOT NULL,
  total_late           DECIMAL(14,2) NOT NULL,
  status               VARCHAR(20)   NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  paid_at              DATETIME      NULL,
  paid_amount          DECIMAL(14,2) NULL,
  PRIMARY KEY (id),
  KEY amortization_org_idx (organization_id),
  KEY amortization_property_period_idx (property_id, period_start),
  KEY amortization_contract_month_idx (contract_id, month_number),
  KEY amortization_status_idx (status),
  CONSTRAINT fk_amortization_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_amortization_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_amortization_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
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
  month_period    CHAR(7)       NOT NULL
                    COMMENT 'YYYY-MM — mes al que aplica el descuento',
  attachment_url  VARCHAR(500)  NULL,
  recorded_by     VARCHAR(150)  NOT NULL,
  recorded_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  effective_from  CHAR(7)       NOT NULL
                    COMMENT 'YYYY-MM a partir del cual aplica el aumento',
  recorded_by     VARCHAR(150)  NOT NULL,
  recorded_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY increases_org_idx (organization_id),
  KEY increases_property_idx (property_id),
  KEY increases_contract_effective_idx (contract_id, effective_from),
  CONSTRAINT fk_increases_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_increases_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_increases_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 15. RENT_INVOICES — cuentas de cobro al inquilino (incluye invoice_number)
-- ============================================================================
-- `invoice_number` se genera en POST /api/billing/invoices/send con formato
-- CC-YYYYMM-NNN (scoped por property_id + period). Idempotente.
CREATE TABLE IF NOT EXISTS rent_invoices (
  id              CHAR(36)      NOT NULL,
  invoice_number  VARCHAR(20)   NULL
                    COMMENT 'Consecutivo visible CC-YYYYMM-NNN. Se setea al enviar la cuenta de cobro.',
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
  sent_at         DATETIME      NULL,
  paid_at         DATETIME      NULL,
  paid_amount     DECIMAL(14,2) NULL,
  payment_link    VARCHAR(500)  NULL,
  notes           TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_invoice_contract_period (contract_id, period),
  -- BUG-007/032: UNIQUE compuesto (org, property, period, invoice_number)
  -- permite que cada property tenga su propio contador por mes pero
  -- rechaza duplicados dentro del mismo (org, property, period).
  -- Migration 012 aplica lo mismo en DBs existentes.
  UNIQUE KEY uniq_invoice_org_prop_period_number (organization_id, property_id, period, invoice_number),
  KEY invoices_org_idx (organization_id),
  KEY invoices_property_period_idx (property_id, period),
  KEY invoices_invoice_number_idx (invoice_number),
  CONSTRAINT fk_invoices_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 16. PROPERTY_ACTIONS — log histórico append-only
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_actions (
  id              CHAR(36)     NOT NULL,
  organization_id CHAR(36)     NOT NULL,
  property_id     CHAR(36)     NOT NULL,
  type            VARCHAR(50)  NOT NULL
                    CHECK (type IN (
                      'property_created', 'property_archived', 'property_restored', 'property_owner_changed',
                      'documents_uploaded', 'mandato_signed', 'inventory_initial_signed', 'inventory_final_signed',
                      'contract_created', 'contract_signed', 'policy_approved',
                      'tenant_assigned', 'tenant_changed',
                      'payment_received', 'discount_registered', 'increase_registered',
                      'invoice_sent', 'invoice_paid', 'billing_policy_updated',
                      'bank_account_added', 'property_returned', 'note_added'
                    )),
  description     VARCHAR(500) NOT NULL,
  payload         JSON         NULL,
  actor_name      VARCHAR(150) NOT NULL,
  occurred_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY property_actions_property_idx (property_id, occurred_at),
  KEY property_actions_org_idx (organization_id),
  CONSTRAINT fk_property_actions_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_property_actions_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 17. USER_OAUTH_TOKENS — tokens OAuth de Google Drive (por usuario)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id            CHAR(36)     NOT NULL,
  user_id       VARCHAR(150) NOT NULL,
  provider      VARCHAR(50)  NOT NULL
                  CHECK (provider IN ('google_drive')),
  access_token  TEXT         NOT NULL,
  refresh_token    TEXT         NULL,
  expiry_date      BIGINT       NULL
                     COMMENT 'Unix timestamp ms del expiration del access_token',
  drive_folder_id  VARCHAR(200) NULL
                     COMMENT 'ID de la carpeta "InmoControl" en el Drive del usuario',
  scopes           VARCHAR(500) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY user_oauth_user_provider_idx (user_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 18. OWNER_PAYOUTS — transferencias reales al propietario (Fase 10)
-- ============================================================================
-- Una fila por transferencia real. Mismo periodo puede tener N payouts
-- (giros parciales, ajustes). En el estado de cuenta mensual se muestran
-- AMBOS: el cálculo teórico (calculateMonthlySettlement) y los payouts reales.
CREATE TABLE IF NOT EXISTS owner_payouts (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  contract_id     CHAR(36)      NULL
                    COMMENT 'NULL cuando el pago es por la propiedad completa (caso normal)',
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
  notes           TEXT          NULL,
  recorded_by     VARCHAR(150)  NOT NULL,
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

-- ============================================================================
-- 19-22. SAAS BILLING — planes, subscripciones, métodos de pago, facturas
-- ============================================================================
-- NO confundir con el billing de PROPIEDADES (arriendos). Esto es la
-- subscripción de la ORGANIZACIÓN al SaaS InmoControl.

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
  UNIQUE KEY uniq_saas_invoice_number (invoice_number),
  KEY si_org_idx (organization_id),
  KEY si_subscription_idx (subscription_id),
  KEY si_status_idx (status),
  CONSTRAINT fk_si_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_si_subscription FOREIGN KEY (subscription_id) REFERENCES saas_subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT fk_si_payment_method FOREIGN KEY (payment_method_id) REFERENCES saas_payment_methods (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- RESUMEN FINAL
-- ============================================================================
-- Total de tablas: 22 (1-22), más 1 tabla auxiliar (user_oauth_tokens = #17).
--
-- Listado completo:
--   1.  organizations
--   2.  profiles
--   3.  properties            (status en ESPAÑOL)
--   4.  tenants
--   5.  property_documents
--   6.  contracts
--   7.  inventories
--   8.  financial_records
--   9.  bank_accounts
--   10. policies
--   11. billing_policies
--   12. amortization_rows
--   13. property_discounts
--   14. rent_increases
--   15. rent_invoices         (con invoice_number + índice)
--   16. property_actions
--   17. user_oauth_tokens
--   18. owner_payouts         (Fase 10)
--   19. saas_plans
--   20. saas_subscriptions
--   21. saas_payment_methods
--   22. saas_invoices
--
-- TOTAL OBJETOS DE DB:
--   • 22 tablas
--   •  0 vistas
--   •  0 triggers
--   •  0 stored procedures
--   •  0 funciones
--
-- Toda la lógica vive en TypeScript (cálculos financieros, validaciones).
-- El server Express es una capa fina de persistencia.
-- ============================================================================
