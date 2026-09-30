/**
 * Wrapper minimalista sobre IndexedDB para no depender de idb-keyval.
 *
 * Store único: 'inmoControl' con keys planas:
 *  - `inventory:<propertyId>:<inicial|final>` → Inventory
 *  - `photo:<inventoryId>:<photoId>`           → InventoryPhoto (dataURL)
 *
 * Por qué dos stores separados en lugar de embebir las fotos en el Inventory:
 *  - Carga perezosa: cuando el wizard abre un área, solo trae esas fotos
 *  - Fotos grandes (1-3MB cada una) no se mueven en cada save
 */

const DB_NAME = 'inmocontrol-db';
const DB_VERSION = 1;
const STORE_INVENTORIES = 'inventories';
const STORE_PHOTOS = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_INVENTORIES)) {
        db.createObjectStore(STORE_INVENTORIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // FIX #17: si open() falla, resetear dbPromise para que el próximo
    // intento reintente. Antes el rechazo quedaba cacheado para siempre
    // y la app quedaba rota hasta reload.
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      console.warn('[inventoryDB] open() bloqueado por otra conexión');
    };
  });
  return dbPromise;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const objectStore = transaction.objectStore(store);
    const request = fn(objectStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const inventoryDB = {
  async getInventory(id: string): Promise<any | null> {
    const result = await tx<any | undefined>(STORE_INVENTORIES, 'readonly', (s) => s.get(id));
    return result ?? null;
  },

  async listInventoriesByProperty(propertyId: string): Promise<any[]> {
    const all = await tx<any[]>(STORE_INVENTORIES, 'readonly', (s) => s.getAll());
    return all.filter((inv) => inv.propertyId === propertyId);
  },

  async saveInventory(inv: any): Promise<void> {
    await tx(STORE_INVENTORIES, 'readwrite', (s) => s.put(inv));
  },

  async deleteInventory(id: string): Promise<void> {
    await tx(STORE_INVENTORIES, 'readwrite', (s) => s.delete(id));
    // Limpia también las fotos asociadas
    const photos = await tx<any[]>(STORE_PHOTOS, 'readonly', (s) => s.getAll());
    const toDelete = photos.filter((p: any) => p.id.startsWith(`${id}:`));
    await Promise.all(toDelete.map((p: any) => tx(STORE_PHOTOS, 'readwrite', (s) => s.delete(p.id))));
  },

  async getPhoto(id: string): Promise<any | null> {
    const result = await tx<any | undefined>(STORE_PHOTOS, 'readonly', (s) => s.get(id));
    return result ?? null;
  },

  async savePhoto(photo: any): Promise<void> {
    await tx(STORE_PHOTOS, 'readwrite', (s) => s.put(photo));
  },

  async deletePhoto(id: string): Promise<void> {
    await tx(STORE_PHOTOS, 'readwrite', (s) => s.delete(id));
  },

  async listPhotosByInventory(inventoryId: string): Promise<any[]> {
    const all = await tx<any[]>(STORE_PHOTOS, 'readonly', (s) => s.getAll());
    return all.filter((p: any) => p.id.startsWith(`${inventoryId}:`));
  },
};

/** Helper para construir ids consistentes. */
export const photoId = (inventoryId: string, photoId: string) => `${inventoryId}:${photoId}`;

/**
 * Normaliza el campo `photos` de un Inventory a SIEMPRE un array.
 *
 * Por qué existe: detectamos en prod (jul-2026) que algunos inventarios
 * guardados en IndexedDB o devueltos por MySQL tienen `photos` como un
 * Record/Object ({ id1: {...}, id2: {...} }) en vez de un Array
 * ([{id, dataUrl, ...}, ...]). El código asumía array y llamaba
 * `.map()` / `for...of`, lo que tiraba `TypeError: .map is not a function`.
 *
 * La causa histórica más probable es una versión vieja del wizard que
 * guardaba fotos como diccionario indexado por id. MySQL heredó esa forma
 * via `JSON.stringify(...)` y la devolvió como objeto cuando mysql2
 * auto-parseó la columna JSON.
 *
 * Formas aceptadas de input y su normalización:
 * - `Array` → se devuelve tal cual (con `.filter(Boolean)` por si hay nulls).
 * - `Object` (Record) → se devuelve `Object.values(...)`. Si los valores
 *   ya tienen la forma `{id, dataUrl, areaId, ...}` se usan directo.
 *   Si el Record tiene la forma `{id1: true, id2: true}` (set de ids)
 *   se descartan y se devuelve `[]` (no se puede reconstruir sin
 *   metadata — el agente debe re-tomar las fotos).
 * - `null | undefined` → `[]`.
 * - Cualquier otra cosa (string, number) → `[]`.
 *
 * El helper es IDÉMPOTENTE y SEGURO de llamar múltiples veces. Úselo
 * en TODA lectura de `inventory.photos` antes de iterar:
 *
 * ```ts
 * const photos = normalizePhotosArray(inventory.photos);
 * for (const p of photos) { ... }
 * ```
 */
export function normalizePhotosArray(input: unknown): any[] {
  if (Array.isArray(input)) {
    return input.filter(Boolean);
  }
  if (input && typeof input === 'object') {
    const values = Object.values(input as Record<string, unknown>);
    // Si el Record es un set de ids booleanos (forma `{id1: true}`), descartar.
    const looksLikeIdSet = values.every(
      (v) => v === true || v === false || v == null,
    );
    if (looksLikeIdSet) return [];
    return values.filter(Boolean) as any[];
  }
  return [];
}
