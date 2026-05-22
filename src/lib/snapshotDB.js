// lib/snapshotDB.js
// Persistencia de un snapshot del estado de la app para arrancar offline.
// Base de datos IndexedDB separada de la queue de operaciones pendientes.
// El snapshot se guarda al final de cada init() exitoso y se carga
// cuando init() falla por falta de internet (cold start offline).

const SNAP_DB_NAME = 'mimenu_snapshot';
const SNAP_DB_VERSION = 1;
const SNAP_STORE = 'snapshots';

// TTL: si el snapshot tiene más de 48h, se considera demasiado viejo
export const SNAPSHOT_MAX_AGE_MS = 48 * 3600 * 1000;

function openSnapDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SNAP_DB_NAME, SNAP_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SNAP_STORE)) {
        db.createObjectStore(SNAP_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Guardar snapshot ──────────────────────────────────────────
// data debe incluir: restaurantId, restaurante, sucursales, menuItems, stock
export async function saveSnapshot(data) {
  try {
    const db = await openSnapDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAP_STORE, 'readwrite');
      tx.objectStore(SNAP_STORE).put({ key: 'main', ts: Date.now(), ...data });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch(e) {
    console.warn('[snapshotDB] No se pudo guardar snapshot:', e);
  }
}

// ── Cargar snapshot ───────────────────────────────────────────
// Retorna null si no existe o si es demasiado viejo
export async function loadSnapshot() {
  try {
    const db = await openSnapDB();
    const snap = await new Promise((resolve, reject) => {
      const tx = db.transaction(SNAP_STORE, 'readonly');
      const req = tx.objectStore(SNAP_STORE).get('main');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!snap) return null;
    if (Date.now() - snap.ts > SNAPSHOT_MAX_AGE_MS) {
      console.warn('[snapshotDB] Snapshot demasiado viejo — ignorando');
      return null;
    }
    return snap;
  } catch(e) {
    return null;
  }
}

// ── Limpiar snapshot ──────────────────────────────────────────
export async function clearSnapshot() {
  try {
    const db = await openSnapDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAP_STORE, 'readwrite');
      tx.objectStore(SNAP_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch(e) {}
}
