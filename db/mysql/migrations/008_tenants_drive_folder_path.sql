-- 008_tenants_drive_folder_path.sql
-- Agrega `drive_folder_path` a `tenants` (path legible de la carpeta del
-- tenant en Drive). El código en server/routes/tenants.ts:233 ya la lee
-- en el GET / y reventaba con ER_BAD_FIELD_ERROR hasta que la columna
-- existiera.
--
-- Aplicar con:  node scripts/apply-008-migration.mjs
--   (idempotente: si la columna ya existe, no hace nada)
--
-- IMPORTANTE: replicar este cambio en db/mysql/schema-completo.sql y
-- db/mysql/schema-hostinger.sql para que deploys frescos a Hostinger
-- no vuelvan a quedar rotos.

ALTER TABLE tenants
  ADD COLUMN drive_folder_path VARCHAR(500) NULL
    COMMENT 'Path legible de la carpeta del tenant en Drive'
    AFTER tenant_drive_folder_id;