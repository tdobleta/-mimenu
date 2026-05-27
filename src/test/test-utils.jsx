// ── Test Utilities ────────────────────────────────────────────────────────
// Wrappers y mocks para renderizar componentes en tests.

import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

// ── Mock Toast Provider ──────────────────────────────────────────────────
const mockAddToast = vi.fn();
const ToastContext = React.createContext({ addToast: mockAddToast });

function MockToastProvider({ children }) {
  return (
    <ToastContext.Provider value={{ addToast: mockAddToast }}>
      {children}
    </ToastContext.Provider>
  );
}

// ── Mock Store ───────────────────────────────────────────────────────────
const defaultStore = {
  restaurantId: 'rest-test-1',
  restaurante: { nombre: 'Test Restaurant', telefono: '1234567890' },
  branchId: 'branch-test-1',
  sucursales: [{ id: 'branch-test-1', nombre: 'Sucursal 1' }],
  turnoActivo: {
    id: 'shift-test-1',
    branchId: 'branch-test-1',
    fondoInicial: 10000,
    abiertaAt: new Date().toISOString(),
    tipoTurno: 'general',
    retiros: [],
  },
  tables: [],
  menuItems: [],
  stock: [],
  getStock: () => [],
  getReservas: () => [],
  setBranchId: vi.fn(),
  addRetiro: vi.fn(),
  logAccion: vi.fn(),
  refreshCharts: vi.fn(),
  setTurnoActivo: vi.fn(),
  cerrarTurnoActivo: vi.fn(),
  closeTable: vi.fn(),
  closeTableOffline: vi.fn(),
};

const StoreContext = React.createContext(defaultStore);

function MockStoreProvider({ children, overrides = {} }) {
  const store = { ...defaultStore, ...overrides };
  return (
    <StoreContext.Provider value={store}>
      {children}
    </StoreContext.Provider>
  );
}

// ── Mock Auth Provider ───────────────────────────────────────────────────
const defaultAuth = {
  user: { id: 'user-test-1', email: 'test@test.com', role: 'user' },
  isLoadingAuth: false,
  authError: null,
  authChecked: true,
};

const AuthContext = React.createContext(defaultAuth);

function MockAuthProvider({ children, overrides = {} }) {
  const auth = { ...defaultAuth, ...overrides };
  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

// ── All Providers Wrapper ────────────────────────────────────────────────
export function AllProviders({ children, storeOverrides = {}, authOverrides = {} }) {
  return (
    <MockAuthProvider overrides={authOverrides}>
      <MockStoreProvider overrides={storeOverrides}>
        <MockToastProvider>
          {children}
        </MockToastProvider>
      </MockStoreProvider>
    </MockAuthProvider>
  );
}

// ── Custom render ────────────────────────────────────────────────────────
export function renderWithProviders(ui, options = {}) {
  const { storeOverrides, authOverrides, ...renderOptions } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders storeOverrides={storeOverrides} authOverrides={authOverrides}>
        {children}
      </AllProviders>
    ),
    ...renderOptions,
  });
}

// ── Exports ──────────────────────────────────────────────────────────────
export { mockAddToast, defaultStore, defaultAuth };
export { render } from '@testing-library/react';
export { screen, fireEvent, waitFor, within } from '@testing-library/react';
export { vi } from 'vitest';
