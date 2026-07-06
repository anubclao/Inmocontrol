/**
 * InmoControl — limpia localStorage + IndexedDB del cliente
 *
 * Úsalo desde DevTools del navegador:
 *   1. F12 → Console
 *   2. Pegá este código y Enter
 *   3. Refresh la página (Ctrl+R)
 *
 * Borra:
 *   localStorage: inmocontrol:*, gdrive_*, settings:*, properties, tenants,
 *                 financialRecords, user (Zustand persist + legacy)
 *   IndexedDB:    'inmocontrol-db' (inventarios + fotos del wizard)
 *   sessionStorage: cualquier clave relacionada
 */
(function clearAllInmoControlStorage() {
  // 1. localStorage
  const keys = Object.keys(localStorage);
  const removed = [];
  for (const key of keys) {
    if (
      key.startsWith('inmocontrol') ||
      key.startsWith('gdrive_') ||
      key.startsWith('settings:') ||
      key.startsWith('properties') ||
      key.startsWith('tenants') ||
      key.startsWith('financialRecords') ||
      key.startsWith('user')
    ) {
      localStorage.removeItem(key);
      removed.push(key);
    }
  }
  console.info(`[reset-data.js] localStorage: ${removed.length} claves borradas`, removed);

  // 2. sessionStorage
  const sKeys = Object.keys(sessionStorage);
  let sRemoved = 0;
  for (const key of sKeys) {
    if (key.startsWith('inmocontrol') || key.startsWith('gdrive_')) {
      sessionStorage.removeItem(key);
      sRemoved++;
    }
  }
  console.info(`[reset-data.js] sessionStorage: ${sRemoved} claves borradas`);

  // 3. IndexedDB — borrar DB completa (inventarios + fotos cacheados)
  const DB_NAME = 'inmocontrol-db';
  const delReq = indexedDB.deleteDatabase(DB_NAME);
  delReq.onsuccess = () => console.info(`[reset-data.js] IndexedDB '${DB_NAME}' borrada OK`);
  delReq.onerror = () => console.warn(`[reset-data.js] No se pudo borrar IndexedDB '${DB_NAME}'`);
  delReq.onblocked = () => console.warn(`[reset-data.js] IndexedDB '${DB_NAME}' bloqueada — cerrá otras pestañas de la app`);

  console.info('[reset-data.js] Recargá la página (Ctrl+R) para que la app arranque limpia.');
})();