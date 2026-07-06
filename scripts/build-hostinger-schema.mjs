// Build script: genera un archivo .sql único y consolidado para deploy limpio
// en Hostinger (o cualquier MySQL 8.0+ fresh).
//
// Entrada:
//   - db/mysql/schema-completo.sql  (modelo base consolidado)
//   - db/mysql/migrations/006_property_charges.sql  (tabla nueva; el backfill
//     SQL está pensado para upgrade de DBs viejas, lo saltamos acá porque es
//     deploy limpio)
//
// Salida:
//   - db/mysql/schema-hostinger.sql
//
// Idempotente: el archivo generado usa `IF NOT EXISTS` en sus CREATE TABLE y
// no toca datos. Para resetear en Hostinger basta con `DROP DATABASE` y
// rerun este script.

import fs from 'fs';
import path from 'path';

const basePath = path.resolve('db/mysql/schema-completo.sql');
const outPath  = path.resolve('db/mysql/schema-hostinger.sql');

// Lo que agregamos por encima del schema base: tabla property_charges (fresh).
// NO incluye el INSERT del backfill porque este script corre contra una DB
// vacía (deploy limpio en Hostinger).
//
// IMPORTANTE — FKs declaradas como ALTER TABLE separado, no inline:
// Algunas versiones de MySQL shared (Hostinger, MariaDB 10.x) fallan con
// "Error 150: Foreign key constraint is incorrectly formed" cuando el
// CREATE TABLE declara FKs inline, aunque los tipos/charset coincidan.
// El workaround estándar es crear la tabla con índices y agregar las FKs
// vía ALTER TABLE después, donde el parser sí las acepta.
const extras = `
-- ============================================================================
-- InmoControl — NOVEDADES DE CARGOS UNIFICADAS (Fase 12+)
-- ============================================================================
-- Tabla \`property_charges\` unifica lo que antes eran "discounts" (solo
-- propietario) y los cargos manuales del FinancialView. Cada novedad define
-- a quién se le imputa (owner / tenant / both) y si entra o no en la cuenta
-- de cobro del mes.
--
-- La integridad referencial se enforza en la capa de aplicación
-- (NovedadFormModal + cálculos de billing). Los FKs que se agregan debajo
-- como ALTER TABLE son defensivos — si tu MySQL los rechaza, podés
-- comentarlos sin afectar la app.
-- ============================================================================

-- Paso 1: Crear la tabla SIN FKs (para evitar Error 150 en MySQL shared)
CREATE TABLE IF NOT EXISTS property_charges (
  id                   CHAR(36)      NOT NULL,
  organization_id      CHAR(36)      NOT NULL,
  property_id          CHAR(36)      NOT NULL,
  period               CHAR(7)       NOT NULL
                         COMMENT 'YYYY-MM — mes al que aplica el cargo',
  type                 ENUM(
                         'public_services', 'maintenance', 'repair',
                         'tax', 'insurance', 'commission',
                         'parking', 'other'
                       ) NOT NULL,
  description          VARCHAR(500)  NOT NULL,
  amount               DECIMAL(14,2) NOT NULL
                         COMMENT 'Monto en COP (pesos enteros, sin decimales)',
  charged_to           ENUM('owner','tenant','both') NOT NULL DEFAULT 'owner',
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
  KEY charges_charged_to_idx (charged_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paso 2: Agregar las FKs como ALTER separado (más tolerante)
ALTER TABLE property_charges
  ADD CONSTRAINT fk_charges_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_charges_property
    FOREIGN KEY (property_id)     REFERENCES properties (id)     ON DELETE CASCADE;
`;

const header = `-- ============================================================================
-- InmoControl — SCHEMA CONSOLIDADO PARA DEPLOY LIMPIO (MySQL 8.0+)
-- ============================================================================
-- Este archivo se genera con:  node scripts/build-hostinger-schema.mjs
-- Es la consolidación de:
--   • schema-completo.sql (22 tablas del modelo base)
-- • + tabla property_charges (Fase 12+)
--
-- Deploy en Hostinger (paso 5 del DEPLOY.md):
--   mysql -u <DB_USER> -p <DB_NAME> < db/mysql/schema-hostinger.sql
--
-- Requisitos:
--   - MySQL 8.0+ (check constraints enforced desde 8.0.16)
--   - InnoDB
--   - utf8mb4 / utf8mb4_unicode_ci
--
-- IMPORTANTE — IDEMPOTENCIA:
--   Todo está escrito con \`IF NOT EXISTS\` y \`DROP ... IF EXISTS\` donde
--   corresponde. Es seguro de correr múltiples veces sin romper nada.
--
-- Después del schema, correr:
--   node scripts/seed-pilot.mjs   (crea admin user + 1 propiedad seed)
-- ============================================================================
`;

const base = fs.readFileSync(basePath, 'utf8');

// Removemos el header original del schema-completo.sql para evitar duplicar
// bloques de comentarios. El primer CREATE TABLE marca el inicio del DDL.
const ddlStart = base.indexOf('CREATE TABLE IF NOT EXISTS organizations');

const out =
  header +
  '\n' +
  base.slice(ddlStart) +  // solo DDL + checks (omite el header viejo)
  '\n' +
  extras;

fs.writeFileSync(outPath, out);
console.log(`[build-hostinger-schema] OK: ${outPath} (${out.length} bytes)`);
