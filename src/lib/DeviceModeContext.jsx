// lib/DeviceModeContext.jsx
// Device mode context — UX convenience, NOT security.
//
// Each physical device (tablet, laptop, phone) declares its purpose:
//   admin, cashier, pos, kds, stock
//
// The mode controls the default landing route and (future) sidebar filtering.
// It does NOT replace RoleGuard — role-based access is still enforced server-side.
//
// Persisted in localStorage so the device remembers its mode across sessions.

import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'mimenu_device_mode';

export const VALID_MODES = ['admin', 'cashier', 'pos', 'kds', 'stock'];

export const MODE_DEFAULT_ROUTE = {
  admin:   '/',
  cashier: '/caja',
  pos:     '/salon',
  kds:     '/cocina',
  stock:   '/stock',
};

export const MODE_LABELS = {
  admin:   'Admin',
  cashier: 'Cajero',
  pos:     'Punto de venta',
  kds:     'Cocina (KDS)',
  stock:   'Stock',
};

const DeviceModeContext = createContext(null);

function readMode(storage) {
  try {
    const stored = storage?.getItem?.(STORAGE_KEY);
    if (stored && VALID_MODES.includes(stored)) return stored;
  } catch {}
  return null;
}

export function DeviceModeProvider({ children, storage = globalThis.localStorage }) {
  const [mode, setModeState] = useState(() => readMode(storage));

  const setMode = useCallback((m) => {
    if (!VALID_MODES.includes(m)) {
      console.warn(`[DeviceMode] Modo inválido: "${m}". Válidos: ${VALID_MODES.join(', ')}`);
      return;
    }
    try { storage?.setItem?.(STORAGE_KEY, m); } catch {}
    setModeState(m);
  }, [storage]);

  const clearMode = useCallback(() => {
    try { storage?.removeItem?.(STORAGE_KEY); } catch {}
    setModeState(null);
  }, [storage]);

  return (
    <DeviceModeContext.Provider value={{ mode, setMode, clearMode }}>
      {children}
    </DeviceModeContext.Provider>
  );
}

export function useDeviceMode() {
  const ctx = useContext(DeviceModeContext);
  if (!ctx) {
    throw new Error('useDeviceMode debe usarse dentro de DeviceModeProvider');
  }
  return ctx;
}
