-- ============================================================================
-- 002 — status "En Colocación" en properties (BUG-034: idempotente)
-- ============================================================================
-- Agrega el status "En Colocación" al CHECK constraint de properties.status.
-- Aplica a MySQL 8+. Los valores canónicos son los ESPAÑOLES definidos en
-- AGENTS.md (Sección "Schema importante de `properties.status`).
--
-- Ejecución:
--   node scripts/apply-002-migration.mjs   (chequea antes de aplicar)
--   ó
--   mysql -u root -p inmocontrol < db/mysql/migrations/002_add_status_en_colocacion.sql
--
-- Idempotente (jul-2026): si las constraints ya están actualizadas, no
-- dropea ni crea nada. Patrón pre-check con information_schema (mismo que
-- 009/010/011/012/013).
-- ============================================================================

-- 1. Soltar el CHECK viejo (si existe). El nombre original es properties_chk_1
--    en el schema.sql legacy; en migraciones más nuevas puede ser
--    properties_chk_status. Solo dropeamos si existe.
SET @old_chk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'properties'
    AND CONSTRAINT_NAME = 'properties_chk_1'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_drop := IF(
  @old_chk_exists > 0,
  'ALTER TABLE properties DROP CONSTRAINT properties_chk_1',
  'SELECT "BUG-034: properties_chk_1 no existe, OK (ya migrado)" AS info'
);

PREPARE stmt FROM @sql_drop;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Recrear la constraint con valores canónicos en español (incluye
--    'En Colocación'). Si ya existe con el nombre nuevo, no la creamos
--    de nuevo.
SET @new_chk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'properties'
    AND CONSTRAINT_NAME = 'properties_chk_status'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_add := IF(
  @new_chk_exists = 0,
  'ALTER TABLE properties ADD CONSTRAINT properties_chk_status CHECK (status IN (''Pendiente'', ''Activo'', ''En Colocación'', ''Arrendado'', ''Inactivo''))',
  'SELECT "BUG-034: properties_chk_status ya existe, OK (idempotente)" AS info'
);

PREPARE stmt FROM @sql_add;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. (Opcional pero recomendado) Migrar filas existentes que tengan los valores viejos en inglés.
--    Si tenés datos en producción, descomentar y revisar antes de correr:
--
-- UPDATE properties SET status = 'Activo'    WHERE status = 'available';
-- UPDATE properties SET status = 'Arrendado' WHERE status = 'rented';
-- UPDATE properties SET status = 'Inactivo'  WHERE status = 'inactive' OR status = 'maintenance';
--
-- 4. Cambiar el DEFAULT a español también (si tu instalación está limpia):
-- ALTER TABLE properties ALTER COLUMN status SET DEFAULT 'Pendiente';
