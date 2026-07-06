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
    req.onerror = () => reject(req.error);
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
