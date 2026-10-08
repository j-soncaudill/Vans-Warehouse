/**
 * Tiny IndexedDB key/value store for offline mode: the last-known box list
 * and the outbox of actions waiting to sync (photos included, as Blobs).
 * Falls back to memory when IndexedDB is unavailable (private mode, tests).
 */

const DB = "floorcast";
const STORE = "kv";
const memory = new Map<string, unknown>();
let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const v = await run<T>("readonly", (s) => s.get(key));
  return v === undefined ? (memory.get(key) as T | undefined) : v;
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  await run("readwrite", (s) => s.put(value, key));
}
