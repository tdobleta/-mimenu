// public/sw-custom.js
// Service Worker personalizado con Background Sync API.
// Se registra junto al SW generado por Vite PWA.
// Cuando hay operaciones pendientes en la cola 'mimenu-sync',
// el browser las reintenta automáticamente al reconectar —
// incluso si el tab está cerrado.

const SYNC_TAG = 'mimenu-sync';
const DB_NAME = 'mimenu_offline';
const STORE = 'queue';

// ── Abrir IndexedDB desde el SW ───────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = self.indexedDB.open(DB_NAME, 1);
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

async function getPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('ts').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dequeue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Background Sync handler ───────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingOperations());
  }
});

async function syncPendingOperations() {
  const pending = await getPending();
  if (pending.length === 0) return;

  // Notificar a todos los clientes que empiece sync
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'SYNC_STARTED', count: pending.length }));

  let synced = 0;

  for (const op of pending) {
    try {
      await processOp(op);
      await dequeue(op.id);
      synced++;
    } catch (err) {
      console.error('[SW sync] Error en operación:', op.id, err);
      // Si falla, el browser reintentará el sync más tarde automáticamente
      throw err;
    }
  }

  // Notificar completado
  clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETED', synced }));
}

async function processOp(op) {
  const SUPABASE_URL = self.__WB_MANIFEST_SUPABASE_URL || '';
  const SUPABASE_KEY = self.__WB_MANIFEST_SUPABASE_KEY || '';

  if (!SUPABASE_URL) return; // Sin config, skip

  if (op.type === 'INSERT_TURN_ITEM') {
    // Verificar turno activo
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/turns?id=eq.${op.turn_id}&select=status`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const turns = await checkRes.json();
    if (!turns?.[0] || turns[0].status !== 'abierta') return; // Mesa cerrada

    const res = await fetch(`${SUPABASE_URL}/rest/v1/turn_items`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        turn_id:        op.turn_id,
        branch_id:      op.branch_id,
        menu_item_id:   op.menu_item_id || null,
        menu_item_name: op.menu_item_name,
        cantidad:       op.cantidad,
        precio:         op.precio,
        notas:          op.notas || null,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}

// ── Push notifications (para futuro) ─────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'mimenú', {
      body: data.body || '',
      icon: '/favicon.svg',
      tag: data.tag || 'mimenu',
    })
  );
});

// ── Activar sync cuando hay red ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'TRIGGER_SYNC') {
    self.registration.sync?.register(SYNC_TAG).catch(() => {});
  }
});
