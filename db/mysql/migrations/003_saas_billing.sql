-- ============================================================================
-- InmoControl — Migración 003: SaaS Subscription Billing (Fase 8)
-- ============================================================================
-- Agrega el módulo de billing de la PLATAFORMA (planes, subscripciones,
-- payment methods, invoices del SaaS). NO confundir con el billing de
-- PROPIEDADES (rent_invoices, amortization_rows, billing_policies) que
-- sigue en schema.sql — eso es para cobrar arriendos, este es para cobrar
-- la suscripción al SaaS.
--
-- Tablas nuevas:
--   saas_plans            — catálogo de planes (Free, Pro, Business, ...)
--   saas_subscriptions    — subscripción actual de cada organización
--   saas_payment_methods  — métodos de pago (tarjeta, PSE, Nequi) de la org
--   saas_invoices         — facturas emitidas a la org por su suscripción
--
-- Aplica con:
--   mysql -u root -p inmocontrol < 003_saas_billing.sql
--
-- Última actualización: 2026-06-26 (Fase 8 — SaaS Billing)

-- ─────────────────────────────────────────────────────────────────────────
-- 17. SAAS_PLANS — catálogo de planes
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_plans (
  id                  CHAR(36)      NOT NULL,
  slug                VARCHAR(50)   NOT NULL COMMENT 'free|pro|business|...',
  name                VARCHAR(100)  NOT NULL COMMENT 'Nombre comercial',
  description         VARCHAR(500)  NULL,
  -- Precio mensual en COP (sin decimales, moneda colombiana)
  price_cop           DECIMAL(14,0) NOT NULL DEFAULT 0,
  -- IVA colombiano (19% estándar) — se calcula al facturar
  -- Límites del plan
  max_properties      INT           NOT NULL DEFAULT 5,
  max_users           INT           NOT NULL DEFAULT 1,
  max_alerts_per_month INT          NOT NULL DEFAULT 100,
  -- Features (JSON array de strings para flexibilidad)
  features_json       JSON          NULL,
  -- Orden de display (menor = primero) y disponibilidad
  sort_order          INT           NOT NULL DEFAULT 100,
  is_active           TINYINT(1)    NOT NULL DEFAULT 1,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_plans_slug (slug),
  KEY plans_active_idx (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 18. SAAS_SUBSCRIPTIONS — subscripción actual de cada organización
-- ─────────────────────────────────────────────────────────────────────────
-- Una organización tiene UNA subscripción activa a la vez. El ciclo se
-- renueva mensualmente (current_period_end). cancel_at_period_end permite
-- cancelar sin perder el periodo pagado.
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id                    CHAR(36)      NOT NULL,
  organization_id       CHAR(36)      NOT NULL,
  plan_id               CHAR(36)      NOT NULL,
  -- Status: trialing | active | past_due | canceled | unpaid
  status                VARCHAR(20)   NOT NULL DEFAULT 'active'
                          CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  -- Periodo actual de facturación
  current_period_start  DATE          NOT NULL,
  current_period_end    DATE          NOT NULL,
  -- Cancelación programada al final del periodo (no inmediato)
  cancel_at_period_end  TINYINT(1)    NOT NULL DEFAULT 0,
  -- Timestamps de eventos
  started_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  canceled_at           DATETIME      NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Una sola suscripción activa por organización
  UNIQUE KEY uniq_subscription_org (organization_id),
  KEY subscription_plan_idx (plan_id),
  KEY subscription_status_idx (status),
  CONSTRAINT fk_subscription_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id) REFERENCES saas_plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 19. SAAS_PAYMENT_METHODS — métodos de pago de la organización
-- ─────────────────────────────────────────────────────────────────────────
-- Por ahora MOCK (no PSP real). Guardamos últimos 4 + marca + expiry. En
-- SaaS real, acá se guardaría el token del PSP (nunca el PAN completo).
CREATE TABLE IF NOT EXISTS saas_payment_methods (
  id                CHAR(36)      NOT NULL,
  organization_id   CHAR(36)      NOT NULL,
  -- Tipo: card | pse | nequi | bancolombia
  type              VARCHAR(20)   NOT NULL DEFAULT 'card'
                      CHECK (type IN ('card', 'pse', 'nequi', 'bancolombia')),
  -- Solo para cards
  brand             VARCHAR(20)   NULL COMMENT 'visa|mastercard|amex|...',
  last4             CHAR(4)       NULL,
  expiry_month      TINYINT       NULL,
  expiry_year       SMALLINT      NULL,
  holder_name       VARCHAR(150)  NULL,
  -- Para otros métodos (PSE = banco + cuenta, etc.)
  details_json      JSON          NULL,
  -- Solo uno puede ser default
  is_default        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY pm_org_idx (organization_id),
  CONSTRAINT fk_pm_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 20. SAAS_INVOICES — facturas emitidas a la organización
-- ─────────────────────────────────────────────────────────────────────────
-- Cada factura corresponde a un periodo de la suscripción. Status: open |
-- paid | void | uncollectible.
CREATE TABLE IF NOT EXISTS saas_invoices (
  id                  CHAR(36)      NOT NULL,
  organization_id     CHAR(36)      NOT NULL,
  subscription_id     CHAR(36)      NOT NULL,
  payment_method_id   CHAR(36)      NULL,
  -- Numeración visible al cliente (ej: INV-2026-0001)
  invoice_number      VARCHAR(30)   NOT NULL,
  -- Periodo facturado
  period_start        DATE          NOT NULL,
  period_end          DATE          NOT NULL,
  -- Desglose colombiano: subtotal + IVA 19% = total
  subtotal_cop        DECIMAL(14,0) NOT NULL,
  iva_cop             DECIMAL(14,0) NOT NULL,
  total_cop           DECIMAL(14,0) NOT NULL,
  -- Status
  status              VARCHAR(20)   NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'paid', 'void', 'uncollectible')),
  issued_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at             DATETIME      NULL,
  -- Metadata: snapshot del plan al momento de facturar (por si cambia después)
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

-- ─────────────────────────────────────────────────────────────────────────
-- Datos seed: 3 planes iniciales (solo si la tabla está vacía)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO saas_plans (id, slug, name, description, price_cop, max_properties, max_users, max_alerts_per_month, features_json, sort_order, is_active)
SELECT * FROM (
  SELECT
    'plan-free-uuid-0001-000000000001' AS id,
    'free' AS slug,
    'Free' AS name,
    'Para agentes que están empezando' AS description,
    0 AS price_cop,
    5 AS max_properties,
    1 AS max_users,
    50 AS max_alerts_per_month,
    JSON_ARRAY('Hasta 5 inmuebles', '1 usuario', '50 alertas/mes', 'Soporte por email') AS features_json,
    10 AS sort_order,
    1 AS is_active
  UNION ALL SELECT
    'plan-pro-uuid-0002-000000000002',
    'pro',
    'Pro',
    'Para inmobiliarias en crecimiento',
    149000,
    100,
    5,
    1000,
    JSON_ARRAY('Hasta 100 inmuebles', '5 usuarios', '1.000 alertas/mes', 'WhatsApp + Email', 'Soporte prioritario'),
    20,
    1
  UNION ALL SELECT
    'plan-business-uuid-0003-000000000003',
    'business',
    'Business',
    'Para grandes portafolios',
    399000,
    500,
    20,
    10000,
    JSON_ARRAY('Hasta 500 inmuebles', '20 usuarios', '10.000 alertas/mes', 'WhatsApp + Email + SMS', 'Soporte dedicado', 'Reportes avanzados'),
    30,
    1
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM saas_plans WHERE slug = 'free');

-- ============================================================================
-- Verificación
-- ============================================================================
SELECT 'SaaS Billing tables listas' AS status;
SELECT TABLE_NAME, TABLE_ROWS
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME LIKE 'saas\_%'
  ORDER BY TABLE_NAME;
