-- ============================================================================
-- Migración 017 — login_attempts: contador real de intentos
-- ============================================================================
--
-- QUÉ ARREGLA
--
--   `login_attempts` tiene `UNIQUE KEY uniq_window (ip, email, window_start)` y
--   `recordAttempt()` hace `INSERT ... ON DUPLICATE KEY UPDATE`. Consecuencia:
--   cada (ip, email) tiene UNA sola fila por ventana de 15 minutos. El
--   middleware contaba filas (`COUNT(*)`), así que el contador nunca pasaba
--   de 1 y el umbral de 5 intentos fallidos (`auth.ts:124`) NUNCA se
--   alcanzaba. Un atacante podía probar contraseñas sin límite contra un
--   correo conocido.
--
-- QUÉ HACE
--
--   Agrega `attempts` para que el conteo sea `SUM(attempts)` en vez de
--   `COUNT(*)`. Se conserva el UNIQUE: sigue sirviendo como dedupe por
--   ventana y evita que la tabla crezca sin control (una fila por
--   ip+email+ventana, no una por intento).
--
--   Las filas existentes quedan con attempts = 1, que es exactamente lo que
--   representaban hasta ahora (un único registro por ventana).
--
-- ORDEN DE APLICACIÓN
--
--   1. Aplicar esta migración.
--   2. Recién después desplegar el código nuevo.
--
--   El código nuevo detecta si la columna falta (`ER_BAD_FIELD_ERROR`), lo
--   loguea como error accionable y sigue insertando con el esquema viejo, así
--   que un deploy invertido NO rompe el login: solo deja el límite como está
--   hoy (roto) hasta que corras la migración.
--
-- IDEMPOTENTE: si `attempts` ya existe, el bloque no hace nada.
-- Aplicar: node scripts/apply-017-migration.mjs   (o pegar en phpMyAdmin)
-- ============================================================================

SET @col_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'login_attempts'
     AND COLUMN_NAME  = 'attempts'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE login_attempts ADD COLUMN attempts INT UNSIGNED NOT NULL DEFAULT 1 AFTER success',
  'SELECT ''login_attempts.attempts ya existe — nada que hacer'' AS status'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
