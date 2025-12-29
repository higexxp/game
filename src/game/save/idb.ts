const DB_NAME = "konbini_game";
const DB_VERSION = 1;

const STORE_SAVES = "saves";
const STORE_KV = "kv";

function isBrowser() {
  return typeof window !== "undefined";
}

export function canUseIndexedDB(): boolean {
  return isBrowser() && "indexedDB" in window;
}

export function openDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDB()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_SAVES)) {
        db.createObjectStore(STORE_SAVES, { keyPath: "slotId" });
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export function tx<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    let request: IDBRequest<T> | undefined;
    try {
      const maybeReq = fn(store);
      if (maybeReq) request = maybeReq as IDBRequest<T>;
    } catch (e) {
      reject(e);
      return;
    }

    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB tx failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB tx aborted"));
  });
}

export const stores = { STORE_SAVES, STORE_KV };
