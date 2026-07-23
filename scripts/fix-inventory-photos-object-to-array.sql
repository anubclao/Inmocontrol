-- ============================================================================
-- Fix: inventories.photos stored as JSON Object instead of JSON Array
-- Date: 2026-07-23
-- Symptom in prod: click "Inicial" or "Final" en Detalle del Inmueble →
--                   [gallery] Load photos: TypeError: (st.photos ?? []).map
--                   is not a function
-- Cause: legacy data (jul-2026) was written as Record/Object in IndexedDB by
--        an older wizard version; MySQL inherited the same shape via
--        JSON.stringify(photos) and the column was never re-validated.
--
-- Safe migration:
--   1. Inspect (no writes): cuenta cuántas filas tienen `photos` como OBJECT.
--   2. If > 0, run the UPDATE that converts Record → Array by extracting
--      the values via JSON_ARRAYAGG / JSON_OBJECTAGG * tricks*.
--   3. Verify: la cuenta de OBJECT después de la migración debe ser 0.
--
-- Apply in phpMyAdmin → SQL tab, OR
-- Apply via Hostinger Node.js terminal:
--   cd ~/domains/inmocontrol.tecnowebsupportia.com/nodejs
--   node scripts/apply-010-inventory-photos-array.mjs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Inspect — cuántas filas tienen photos como OBJECT?
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*) AS total_inventories,
  SUM(CASE WHEN JSON_TYPE(photos) = 'ARRAY'  THEN 1 ELSE 0 END) AS as_array,
  SUM(CASE WHEN JSON_TYPE(photos) = 'OBJECT' THEN 1 ELSE 0 END) AS as_object,
  SUM(CASE WHEN JSON_TYPE(photos) IS NULL    THEN 1 ELSE 0 END) AS as_null
FROM inventories;

-- Si `as_object > 0`, descomentar y correr el UPDATE de abajo.

-- ----------------------------------------------------------------------------
-- STEP 2: Migrate Object → Array
-- Estrategia: como MySQL no tiene una forma nativa de extraer los values de
-- un JSON Object y meterlos en un array (sin UDFs), usamos un truco:
--   1. JSON_KEYS(photos)        → array de keys
--   2. JSON_EXTRACT(photos, CONCAT('$."', key, '"'))  → value de cada key
--   3. JSON_ARRAYAGG(...)       → junta todos los values en un array
--
-- OJO: este approach es seguro porque:
--   - Si photos ya es ARRAY, JSON_KEYS devuelve NULL y el WHEN filtra la fila.
--   - Si photos es NULL, no se toca.
--   - Solo se actualizan filas con JSON_TYPE = 'OBJECT' confirmado.
-- ----------------------------------------------------------------------------

/*
UPDATE inventories
   SET photos = (
     SELECT JSON_ARRAYAGG(
       JSON_EXTRACT(inventories.photos, CONCAT('$."', jt.`key`, '"'))
     )
     FROM JSON_TABLE(
       JSON_KEYS(inventories.photos),
       '$[*]' COLUMNS (`key` VARCHAR(64) PATH '$')
     ) AS jt
   )
 WHERE JSON_TYPE(photos) = 'OBJECT';
*/

-- ----------------------------------------------------------------------------
-- STEP 3: Verify (run again after UPDATE)
-- ----------------------------------------------------------------------------
-- SELECT
--   COUNT(*) AS total_inventories,
--   SUM(CASE WHEN JSON_TYPE(photos) = 'ARRAY'  THEN 1 ELSE 0 END) AS as_array,
--   SUM(CASE WHEN JSON_TYPE(photos) = 'OBJECT' THEN 1 ELSE 0 END) AS as_object
-- FROM inventories;
--
-- Esperado: as_object = 0, as_array > 0, total_inventories igual que antes.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Si la fila tiene `signatures` o `custom_areas` también con forma OBJECT,
-- replicar el mismo patrón (no es nuestro caso hoy, pero queda documentado).
-- ----------------------------------------------------------------------------
