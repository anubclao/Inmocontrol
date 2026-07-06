-- ============================================================================
-- 002_add_status_en_colocacion.sql
-- ============================================================================
-- Agrega el status "En Colocación" al CHECK constraint de properties.status.
-- Aplica a MySQL 8+. Los valores canónicos son los ESPAÑOLES definidos en
-- AGENTS.md (Sección "Schema importante de `properties.status`).
--
-- Ejecutar:
--   mysql -u root -p inmocontrol < db/mysql/migrations/002_add_status_en_colocacion.sql
-- ============================================================================

-- 1. Soltar el CHECK viejo (que está en inglés según schema.sql inicial)
ALTER TABLE properties DROP CONSTRAINT properties_chk_1;

-- 2. Recrearlo con los valores canónicos en español (incluye el nuevo 'En Colocación')
ALTER TABLE properties
  ADD CONSTRAINT properties_chk_status
  CHECK (status IN ('Pendiente', 'Activo', 'En Colocación', 'Arrendado', 'Inactivo'));

-- 3. (Opcional pero recomendado) Migrar filas existentes que tengan los valores viejos en inglés.
--    Si tenés datos en producción, descomentar y revisar antes de correr:
--
-- UPDATE properties SET status = 'Activo'    WHERE status = 'available';
-- UPDATE properties SET status = 'Arrendado' WHERE status = 'rented';
-- UPDATE properties SET status = 'Inactivo'  WHERE status = 'inactive' OR status = 'maintenance';
--
-- 4. Cambiar el DEFAULT a español también (si tu instalación está limpia):
-- ALTER TABLE properties ALTER COLUMN status SET DEFAULT 'Pendiente';
