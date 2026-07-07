-- 007_drive_folder_id.sql
-- Restaura la columna `drive_folder_id` en `user_oauth_tokens`.
--
-- Históricamente:
--   - db/mysql/schema.sql (26/06/2026)  → SÍ la tenía
--   - db/mysql/schema-completo.sql (2/07/2026) y
--     db/mysql/schema-hostinger.sql (6/07/2026) → la quitaron por error en un refactor
--
-- El código en server/routes/{googleAuth,properties,tenants,inventories}.ts sigue
-- usando la columna en 7 sitios (SELECT / INSERT / UPDATE). Sin la columna, el
-- primer query al status de Drive (`SELECT drive_folder_id ...`) revienta con
-- `ER_BAD_FIELD_ERROR` y, al no tener un unhandledRejection handler, mata el
-- proceso del server. Resultado: todos los endpoints /api/* empiezan a tirar 500.
--
-- Aplicar con:  node scripts/apply-007-migration.mjs
--   (idempotente: si la columna ya existe, no hace nada)
--
-- IMPORTANTE: replicar este cambio en db/mysql/schema-completo.sql y
-- db/mysql/schema-hostinger.sql para que deploys frescos a Hostinger no
-- vuelvan a quedar rotos.

ALTER TABLE user_oauth_tokens
  ADD COLUMN drive_folder_id VARCHAR(200) NULL
    COMMENT 'ID de la carpeta "InmoControl" en el Drive del usuario'
    AFTER expiry_date;