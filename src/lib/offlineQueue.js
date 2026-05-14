// lib/offlineQueue.js
// Cola de operaciones pendientes en IndexedDB.
// Cuando no hay internet, las operaciones se guardan acá.
// Al reconectar, se sincronizan automáticamente.

const DB_NAME = 'mimenu_offline';
const DB_VERSION = 1;
const STORE = 'queue';

// ── Abrir DB ──────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Agregar operación a la cola ───────────────────────────────
export async function enqueue(operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const item = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
      ...operation,
    };
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

// ── Obtener todas las operaciones pendientes ──────────────────
export async function getPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('ts').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ── Eliminar operación procesada ──────────────────────────────
export async function dequeue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Contar pendientes ─────────────────────────────────────────
export async function countPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Limpiar toda la cola ──────────────────────────────────────
export async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
