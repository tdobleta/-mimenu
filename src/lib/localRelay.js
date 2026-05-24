// lib/localRelay.js
// Cliente WebSocket para el relay LAN local.
// Se conecta a ws://mimenu-caja.local:3001 (mDNS) o a la URL guardada en localStorage.
//
// Uso:
//   import { localRelay } from '@/lib/localRelay';
//   await localRelay.connect();                    // retorna true/false
//   localRelay.send('NEW_COMANDA', { ...payload }) // retorna true si envió
//   const unsub = localRelay.on('NEW_COMANDA', fn) // retorna fn para remover
//   localRelay.disconnect();

const RELAY_URL_KEY    = 'mimenu_relay_url';
const RELAY_ENABLED_KEY = 'mimenu_relay_enabled';
const DEFAULT_URL      = 'ws://mimenu-caja.local:3001';
const CONNECT_TIMEOUT  = 3000;   // 3s — si no conecta, falla rápido
const RECONNECT_DELAY  = 10_000; // 10s entre reintentos automáticos

class LocalRelay {
  constructor() {
    this.ws            = null;
    this.isConnected   = false;
    this.isEnabled     = false;
    this.listeners     = new Map();  // type → Set<handler>
    this._reconnectTimer = null;
    this._destroyed    = false;
  }

  get url() {
    return localStorage.getItem(RELAY_URL_KEY) || DEFAULT_URL;
  }

  get enabled() {
    return localStorage.getItem(RELAY_ENABLED_KEY) === 'true';
  }

  // ── connect() → Promise<boolean> ───────────────────────────────────────────
  // Intenta conectar al relay. Retorna true si logró conectar, false si falló.
  // Si ya está conectado, retorna true inmediatamente.
  connect() {
    if (this.isConnected) return Promise.resolve(true);
    if (!this.enabled) return Promise.resolve(false);

    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(this.url);
        const timer = setTimeout(() => {
          if (ws.readyState !== 1) {
            ws.close();
            resolve(false);
          }
        }, CONNECT_TIMEOUT);

        ws.onopen = () => {
          clearTimeout(timer);
          this.ws          = ws;
          this.isConnected = true;
          this._scheduleReconnect(false);
          console.log('[relay] conectado a', this.url);
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timer);
          this.isConnected = false;
          resolve(false);
        };

        ws.onclose = () => {
          this.isConnected = false;
          this.ws = null;
          if (!this._destroyed && this.enabled) {
            this._scheduleReconnect(true);
          }
        };

        ws.onmessage = ({ data }) => {
          try {
            const msg = JSON.parse(data);
            const handlers = this.listeners.get(msg.type);
            if (handlers) handlers.forEach(fn => fn(msg));
          } catch (e) { /* ignorar mensajes mal formados */ }
        };
      } catch (e) {
        resolve(false);
      }
    });
  }

  // ── send() → boolean ────────────────────────────────────────────────────────
  send(type, payload = {}) {
    if (!this.isConnected || this.ws?.readyState !== 1) return false;
    try {
      this.ws.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ── on() → unsub fn ─────────────────────────────────────────────────────────
  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  // ── disconnect() ────────────────────────────────────────────────────────────
  disconnect() {
    this._scheduleReconnect(false);
    this.ws?.close();
    this.ws          = null;
    this.isConnected = false;
  }

  // ── destroy() — para tests / hot-reload ────────────────────────────────────
  destroy() {
    this._destroyed = true;
    this.disconnect();
    this.listeners.clear();
  }

  // ── Internos ────────────────────────────────────────────────────────────────
  _scheduleReconnect(yes) {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (yes && !this._destroyed && this.enabled) {
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this.connect();
      }, RECONNECT_DELAY);
    }
  }
}

// Singleton — una sola instancia en toda la app
export const localRelay = new LocalRelay();

// Iniciar automáticamente si estaba habilitado
if (typeof window !== 'undefined' && localRelay.enabled) {
  localRelay.connect().catch(() => {});
}

// ── Helpers para Configuración ──────────────────────────────────────────────────
export function getRelayConfig() {
  return {
    enabled: localRelay.enabled,
    url:     localStorage.getItem(RELAY_URL_KEY) || DEFAULT_URL,
  };
}

export function saveRelayConfig({ enabled, url }) {
  localStorage.setItem(RELAY_ENABLED_KEY, enabled ? 'true' : 'false');
  localStorage.setItem(RELAY_URL_KEY, url || DEFAULT_URL);
  if (enabled) {
    localRelay.connect();
  } else {
    localRelay.disconnect();
  }
}

export { DEFAULT_URL };
