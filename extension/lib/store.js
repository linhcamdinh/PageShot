// Hands captured images from the service worker to the editor page.
// IndexedDB is shared by every extension context and has no small size cap.

const DB_NAME = 'pageshot';
const STORE = 'captures';
const KEEP = 20; // most recent captures kept; older ones are pruned

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

export async function saveCapture(blob, meta = {}) {
  const db = await open();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await tx(db, 'readwrite', (s) => s.put({ id, blob, createdAt: Date.now(), ...meta }));
  await prune(db);
  return id;
}

export async function getCapture(id) {
  const db = await open();
  return tx(db, 'readonly', (s) => s.get(id));
}

async function prune(db) {
  const keys = await tx(db, 'readonly', (s) => s.getAllKeys());
  const stale = keys.sort().slice(0, Math.max(0, keys.length - KEEP));
  if (stale.length) await tx(db, 'readwrite', (s) => stale.forEach((k) => s.delete(k)));
}
