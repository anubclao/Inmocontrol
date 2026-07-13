-- ============================================================================
-- 010 — property_owners + property_units + property_documents.owner_id/unit_id
-- ============================================================================
-- Habilita el modelo de N propietarios por propiedad y N unidades adicionales
-- (garaje, depósito, etc.) con sus propios certificados de tradición.
--
-- Cambios:
--   1. Nueva tabla `property_owners` — N dueños por propiedad, con % de
--      participación opcional (ownership_pct). El campo legacy
--      `properties.owner_name` se mantiene por compat pero queda
--      representado por la primera fila de `property_owners`.
--   2. Nueva tabla `property_units` — unidades adicionales (parking, storage,
--      other) con su propia matrícula. NO se crea fila para la unidad
--      principal: la unidad principal es la propiedad misma y sus docs
--      (ej: Certificado de Tradición principal) tienen `unit_id = NULL`.
--   3. `property_documents` se amplía con `owner_id` (FK → property_owners)
--      y `unit_id` (FK → property_units). Los docs sin dueño específico
--      (ej: Predial de la propiedad) quedan con `owner_id = NULL`.
--   4. Migración de datos legacy: para cada `properties` con `owner_name`
--      no vacío y sin fila previa en `property_owners`, se inserta 1 fila
--      con `ownership_pct = 100.00`. Idempotente: si ya hay fila, no duplica.
--
-- Decisiones del modelo (alineadas con el usuario):
--   • Predial: 1 por propiedad (no por propietario) → sin owner_id.
--   • Mandato: 1 PDF multi-firmado por todos los propietarios → sigue
--     viviendo en `properties.mandato_pdf_url`, NO se mueve a
--     `property_documents`. La condición de "Activo" sigue siendo ese PDF.
--   • Certificado de Tradición: 1 por unidad. La unidad principal tiene
--     `unit_id = NULL`. Las unidades adicionales tienen `unit_id` apuntando
--     a su fila en `property_units`.
--   • Cédula y RUT: 1 por propietario → `owner_id` apuntando a la fila
--     correspondiente.
--
-- Aplicar con:  node scripts/apply-010-migration.mjs
-- O pegar este SQL en phpMyAdmin → pestaña SQL.
-- ============================================================================

-- ─── 1. property_owners ──────────────────────────────────────────────
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
                    COMMENT 'Porcentaje de participación (0.00-100.00). NULL = sin definir. La suma de todos los owners de una misma propiedad debería ser 100.00 si todos están definidos.',
  position        INT           NOT NULL DEFAULT 1
                    COMMENT 'Posición 1 = primer propietario (el "principal" en pantallas legacy y resúmenes).',
  notes           TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY property_owners_property_idx (property_id),
  KEY property_owners_org_idx (organization_id),
  CONSTRAINT fk_property_owners_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_property_owners_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. property_units ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_units (
  id              CHAR(36)      NOT NULL,
  organization_id CHAR(36)      NOT NULL,
  property_id     CHAR(36)      NOT NULL,
  type            VARCHAR(30)   NOT NULL
                    COMMENT 'parking (garaje) | storage (depósito) | other',
  label           VARCHAR(100)  NOT NULL
                    COMMENT 'Etiqueta legible: "Garaje 12", "Depósito 3B", etc.',
  folio_matricula VARCHAR(50)   NULL
                    COMMENT 'Folio de matrícula inmobiliario de esta unidad (cada unidad tiene su propia matrícula si es registral).',
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

-- ─── 3. property_documents: agregar owner_id + unit_id (idempotente) ──
-- Se hace con prepared statements dinámicos porque MySQL 8 NO soporta
-- `ADD COLUMN IF NOT EXISTS` (eso es sintaxis PostgreSQL). Ver migración
-- 009 — fix del mismo bug.

-- 3a. owner_id
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'property_documents'
    AND COLUMN_NAME = 'owner_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE property_documents ADD COLUMN owner_id CHAR(36) NULL COMMENT "FK a property_owners. NULL si el doc NO es de un dueño específico (ej: Predial de la propiedad)" AFTER property_id',
  'SELECT "owner_id ya existe en property_documents" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3b. unit_id
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'property_documents'
    AND COLUMN_NAME = 'unit_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE property_documents ADD COLUMN unit_id CHAR(36) NULL COMMENT "FK a property_units. NULL para la unidad principal o para docs no asociados a una unidad" AFTER owner_id',
  'SELECT "unit_id ya existe en property_documents" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3c. FK a property_owners
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'property_documents'
    AND CONSTRAINT_NAME = 'fk_property_documents_owner'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE property_documents ADD CONSTRAINT fk_property_documents_owner FOREIGN KEY (owner_id) REFERENCES property_owners (id) ON DELETE CASCADE',
  'SELECT "FK fk_property_documents_owner ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3d. FK a property_units
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'property_documents'
    AND CONSTRAINT_NAME = 'fk_property_documents_unit'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE property_documents ADD CONSTRAINT fk_property_documents_unit FOREIGN KEY (unit_id) REFERENCES property_units (id) ON DELETE CASCADE',
  'SELECT "FK fk_property_documents_unit ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3e. Índices (chequeo separado porque en MySQL 8 `information_schema.STATISTICS`
--     es donde viven los índices, no `TABLE_CONSTRAINTS`)
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'property_documents'
    AND INDEX_NAME = 'property_documents_owner_idx'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX property_documents_owner_idx ON property_documents (owner_id)',
  'SELECT "idx property_documents_owner_idx ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'property_documents'
    AND INDEX_NAME = 'property_documents_unit_idx'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX property_documents_unit_idx ON property_documents (unit_id)',
  'SELECT "idx property_documents_unit_idx ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 4. Migración de datos legacy ────────────────────────────────────
-- Para cada `properties` con `owner_name` no vacío y SIN fila previa en
-- `property_owners`, insertar 1 fila con ownership_pct = 100.00.
-- Idempotente: si ya hay fila, el LEFT JOIN la excluye y no duplica.
--
-- Nota: usamos `UUID()` (de MySQL 8) para el id. Si la versión de MySQL
-- no lo soporta, hay que cambiar por una concatenación tipo
-- CONCAT('legacy-', p.id, '-1').
INSERT INTO property_owners
  (id, organization_id, property_id, name, id_number, phone, email,
   ownership_pct, position, created_at, updated_at)
SELECT
  UUID(),
  p.organization_id,
  p.id,
  p.owner_name,
  p.owner_id_number,
  p.owner_phone,
  p.owner_email,
  100.00,                              -- legacy = 100% al "primer" propietario
  1,
  NOW(),
  NOW()
FROM properties p
LEFT JOIN property_owners po ON po.property_id = p.id
WHERE p.owner_name IS NOT NULL
  AND p.owner_name <> ''
  AND po.id IS NULL;

-- ─── 5. Resumen de la migración ──────────────────────────────────────
SELECT 'Migración 010 aplicada' AS status,
       (SELECT COUNT(*) FROM property_owners) AS total_owners,
       (SELECT COUNT(*) FROM property_units)  AS total_units,
       (SELECT COUNT(DISTINCT property_id) FROM property_owners) AS properties_with_owners;
