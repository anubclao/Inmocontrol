-- ============================================================================
-- 006 — password_hash en profiles (BUG-034: idempotente)
-- ============================================================================
-- AGREGAR password_hash a profiles (NULL permitido para mantener compat con
-- install legacy que no tienen password). El piloto usa bcrypt (ver
-- /api/auth/login en server/routes/auth.ts).
--
-- Tabla profiles es la que se usa para login del piloto. Cuando se migre a
-- SaaS multi-tenant (sprint post-piloto), profiles se mantiene pero la auth
-- pasa a OAuth + JWT. Por ahora un solo usuario por org.
--
-- IMPORTANTE: el password se guarda hasheado con bcrypt (factor 10). NUNCA
-- plaintext. NUNCA loggear el hash.
--
-- Idempotente (jul-2026): si la columna ya existe, no la crea de nuevo.
-- Patrón pre-check con information_schema.
-- ============================================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'profiles'
    AND COLUMN_NAME = 'password_hash'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE profiles ADD COLUMN password_hash VARCHAR(255) NULL COMMENT ''bcrypt hash del password del usuario (factor 10). NULL = sin password (legacy OAuth)''',
  'SELECT "BUG-034: profiles.password_hash ya existe, OK (idempotente)" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
