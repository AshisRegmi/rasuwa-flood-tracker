// IndexedDB offline cache. Stores one atomic snapshot of the whole dataset.
// A single record = one read/write, so the app never renders a half-synced state.

const DB_NAME = 'sahara';
const DB_VERSION = 1;
const STORE = 'kv';

function idb() {
  if (typeof indexedDB === 'undefined') return null;
  return indexedDB;
}

export function openDB() {
  const ix = idb();
  return new Promise((resolve, reject) => {
    if (!ix) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = ix.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let out;
    try {
      out = fn(store);
    } catch (e) {
      db.close();
      reject(e);
      return;
    }
    // Wait for the request itself to settle (tx.oncomplete is not enough for
    // reads — the value lives on req.result, which is undefined until success).
    if (out instanceof IDBRequest) {
      out.onsuccess = () => resolve(out.result);
      out.onerror = () => reject(out.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(out);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('transaction aborted'));
    };
  });
}

export function setItem(key, value) {
  return withStore('readwrite', (store) => store.put(value, key));
}

export function getItem(key) {
  return withStore('readonly', (store) => store.get(key));
}

export function saveSnapshot(snapshot) {
  return setItem('snapshot', snapshot);
}

export function loadSnapshot() {
  return getItem('snapshot');
}

export function savePrefs(prefs) {
  return setItem('prefs', prefs);
}

export function loadPrefs() {
  return getItem('prefs');
}