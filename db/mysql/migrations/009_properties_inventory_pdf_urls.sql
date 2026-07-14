-- ============================================================================
-- 009 — properties.inventory_captacion_pdf_url + inventory_colocacion_pdf_url
-- ============================================================================
-- El código en server/routes/properties.ts:306 (GET /api/properties/:id) y en
-- server/routes/inventories.ts:326 (upload-pdf) usa DOS columnas separadas
-- para los PDFs de inventario (uno por fase):
--   • inventory_captacion_pdf_url  → inventario de captación (firmado por
--                                    propietario al finalizar el wizard)
--   • inventory_colocacion_pdf_url → inventario de colocación (firmado por
--                                    arrendatario + agente al asignar el tenant)
--
-- El schema canónico (schema-completo.sql, schema-hostinger.sql) solo tenía
-- `inventory_pdf_url` (legacy, sin separar por fase). Eso causaba 500 cada
-- vez que alguien abría el modal de detalle de una propiedad (PropertiesView
-- → click en card) porque la SELECT listaba la columna inexistente.
--
-- Esta migración agrega las 2 columnas faltantes, idempotente.
--
-- Además elimina la rama defensiva rota del server (que usaba
-- `ADD COLUMN IF NOT EXISTS`, sintaxis PostgreSQL no soportada por MySQL 8)
-- ya que con esta migración aplicada esa rama es innecesaria.
--
-- Aplicar con:  node scripts/apply-009-migration.mjs
-- ============================================================================

ALTER TABLE properties
  ADD COLUMN inventory_captacion_pdf_url VARCHAR(500) NULL
    COMMENT 'PDF firmado del Inventario de Captación (subido en Inventarios/ de la propiedad)'
    AFTER inventory_pdf_url;

ALTER TABLE properties
  ADD COLUMN inventory_colocacion_pdf_url VARCHAR(500) NULL
    COMMENT 'PDF firmado del Inventario de Colocación (firmado por arrendatario + agente)'
    AFTER inventory_captacion_pdf_url;
