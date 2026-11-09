// idbStore.ts — Step 4 (storage): a tiny IndexedDB key-value helper for the big
// dashboard data (agents + daily history). Browser storage (localStorage) holds
// about 5 MB; a real floor needs about 10 MB, so it overflowed and the data was
// silently lost on reload. IndexedDB has no such small cap.
//
// Every function is total: it never throws. A write returns true (saved) or
// false (not saved), so the caller can tell the user instead of failing silently.
// Values are stored as-is (the browser copies them), with no JSON.stringify.

const DB_NAME = 'cs-ops-data';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getFactory(): IDBFactory | null {
  try {
    return typeof indexedDB !== 'undefined' ? indexedDB : null;
  } catch {
    // Access can throw SecurityError in restricted iframes / some private modes.
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const factory = getFactory();
  if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // If another tab upgrades the database, close ours and reopen next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((error) => {
    dbPromise = null; // allow a later retry
    throw error;
  });
  return dbPromise;
}

/** True when this browser can use IndexedDB at all. */
export function isIdbAvailable(): boolean {
  return getFactory() !== null;
}

/** Read one value. Returns undefined when missing OR when IndexedDB fails. */
export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

/** Save one value. Returns true only after the browser confirms it is stored. */
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
      } catch {
        resolve(false); // e.g. the value cannot be copied
        return;
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false); // quota exceeded ends up here
    });
  } catch {
    return false;
  }
}

/** Delete one value. Returns true when it is gone (or was never there). */
export async function idbDelete(key: string): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
      } catch {
        resolve(false);
        return;
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Tests only: forget the open connection so the next call reopens the database. */
export function resetIdbConnectionForTests(): void {
  dbPromise = null;
}
