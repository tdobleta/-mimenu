// lib/offlineQueue.js
// Cola de operaciones pendientes en IndexedDB.
// Cuando no hay internet, las operaciones se guardan acá.
// Al reconectar, se sincronizan automáticamente.

const DB_NAME = 'mimenu_offline';
const DB_VERSION = 1;
const STORE = 'queue';

// ── Persistencia de storage: evita que el OS borre IndexedDB por falta de espacio ──
// Sin esto, iOS Safari y Android Chrome pueden purgar la DB si el dispositivo
// tiene poco almacenamiento — lo que significa cobros offline perdidos para siempre.
// navigator.storage.persist() pide al browser que marque este origen como persistente.
// En Chrome Android requiere que la PWA esté instalada. En iOS Safari es best-effort.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

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

// ── Actualizar metadatos de una operación (retries, status, lastError) ─
// Usado por drainQueue para marcar dead letters sin borrarlas del store.
export async function updateOp(id, updates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) { resolve(); return; }
      store.put({ ...req.result, ...updates });
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Obtener solo operaciones activas (excluye las marcadas como failed) ─
// countPending() cuenta TODAS incluyendo failed — usar getActive() para el drain.
export async function getActive() {
  const all = await getPending();
  return all.filter(op => op.status !== 'failed');
}

// ── Contar solo operaciones activas (no failed) ───────────────
export async function countActive() {
  const active = await getActive();
  return active.length;
}

// ── Obtener solo operaciones fallidas (dead letters) ──────────
export async function getFailed() {
  const all = await getPending();
  return all.filter(op => op.status === 'failed');
}

// ── Contar operaciones fallidas ───────────────────────────────
export async function countFailed() {
  const failed = await getFailed();
  return failed.length;
}

// ── Limpiar operaciones fallidas (descartarlas) ───────────────
export async function clearFailed() {
  const failed = await getFailed();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    failed.forEach(op => store.delete(op.id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Reintentar operaciones fallidas (volver a estado pendiente) ─
export async function retryFailed() {
  const failed = await getFailed();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    failed.forEach(op => {
      store.put({ ...op, status: 'pending', lastError: null, failedAt: null });
    });
    tx.oncomplete = () => resolve(failed.length);
    tx.onerror = () => reject(tx.error);
  });
}
