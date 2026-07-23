-- =============================================================
-- Limpieza de filas zombie en property_documents (blob/data URLs)
-- =============================================================
-- Contexto: bug del 23-jul-2026. El cliente persistía URLs `blob:` (locales
-- del browser) en `property_documents.file_url`. Esas URLs mueren al refrescar
-- la pestaña, así que el Detalle del Inmueble mostraba "Ver" verde pero el
-- PDF viewer nativo del browser tiraba "Es posible que se haya movido,
-- editado o eliminado".
--
-- Los fixes ya están en producción (AC-15):
--   - server/routes/properties.ts: rechaza blob/data URLs en el POST
--   - PropertiesView.tsx (Caso B + handleFinalize): no envía blob URLs
--   - PropertiesView.tsx (Detalle): muestra "Re-subir" en vez de "Ver"
--     si detecta una fila zombie
--
-- Este script es para limpiar las filas que YA están en la DB. Después de
-- correrlo, hay que re-subir los PDFs desde el Detalle del Inmueble.
-- =============================================================

-- 1) DIAGNÓSTICO: ver cuántas filas zombie hay, agrupadas por propiedad
--    (corre esto PRIMERO para entender el alcance antes de borrar)
SELECT
  pd.property_id,
  p.address,
  pd.doc_type,
  COUNT(*) AS zombie_rows,
  GROUP_CONCAT(DISTINCT LEFT(pd.file_url, 40)) AS sample_urls
FROM property_documents pd
LEFT JOIN properties p ON p.id = pd.property_id
WHERE pd.file_url LIKE 'blob:%' OR pd.file_url LIKE 'data:%'
GROUP BY pd.property_id, pd.doc_type
ORDER BY zombie_rows DESC;

-- 2) LISTADO DETALLADO: qué archivo específico está zombie en cada propiedad
SELECT
  pd.id,
  pd.property_id,
  p.address,
  CASE
    WHEN pd.owner_id IS NOT NULL THEN CONCAT('owner:', po.name)
    WHEN pd.unit_id IS NOT NULL THEN CONCAT('unit:', pu.label)
    ELSE 'property-level'
  END AS scope,
  pd.doc_type,
  pd.file_name,
  LEFT(pd.file_url, 60) AS url_preview
FROM property_documents pd
LEFT JOIN properties p ON p.id = pd.property_id
LEFT JOIN property_owners po ON po.id = pd.owner_id
LEFT JOIN property_units pu ON pu.id = pd.unit_id
WHERE pd.file_url LIKE 'blob:%' OR pd.file_url LIKE 'data:%'
ORDER BY pd.property_id, pd.doc_type;

-- =============================================================
-- 3) LIMPIEZA: descomentar SOLO cuando estés listo para borrar.
--    Después de esto, abrí cada propiedad afectada en el Detalle
--    del Inmueble y re-subí los PDFs (los slots mostrarán "Re-subir"
--    en color ámbar gracias al Fix #3).
-- =============================================================

-- DELETE FROM property_documents
-- WHERE file_url LIKE 'blob:%' OR file_url LIKE 'data:%';

-- 4) Verificación post-limpieza: no debería devolver NINGUNA fila
SELECT COUNT(*) AS remaining_zombies
FROM property_documents
WHERE file_url LIKE 'blob:%' OR file_url LIKE 'data:%';
