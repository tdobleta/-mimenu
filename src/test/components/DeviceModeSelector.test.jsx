// ── Test: DeviceModeSelector component ──────────────────────────────
// Validates role-filtered mode selection, auto-select for single-mode
// roles, and copy clarity.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DeviceModeProvider, VALID_MODES, MODE_LABELS } from '@/lib/DeviceModeContext';

// ── Mock useUserRole ────────────────────────────────────────────────
let mockRole = 'Dueno';
vi.mock('@/lib/useUserRole', () => ({
  default: () => mockRole,
}));

import DeviceModeSelector, { MODES_BY_ROLE } from '@/components/DeviceModeSelector';

// ── localStorage stub ───────────────────────────────────────────────
const localStorageStub = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, writable: true });

function renderSelector(role, onSelect = undefined) {
  mockRole = role;
  localStorageStub.clear();
  return render(
    <DeviceModeProvider>
      <DeviceModeSelector onSelect={onSelect} />
    </DeviceModeProvider>
  );
}

// ── Copy / clarity ──────────────────────────────────────────────────
describe('DeviceModeSelector — copy clarity', () => {
  it('heading says "Modo de dispositivo", not role', () => {
    renderSelector('Dueno');
    expect(screen.getByText('Modo de dispositivo')).toBeDefined();
  });

  it('subtitle clarifies permissions are not affected', () => {
    renderSelector('Dueno');
    expect(screen.getByText(/No cambia tus permisos/)).toBeDefined();
  });

  it('shows hint about permissions depending on role', () => {
    renderSelector('Dueno');
    expect(screen.getByText(/preferencia de navegación/)).toBeDefined();
  });
});

// ── MODES_BY_ROLE contract ──────────────────────────────────────────
describe('DeviceModeSelector — MODES_BY_ROLE contract', () => {
  it('Dueno gets all 5 modes', () => {
    expect(MODES_BY_ROLE.Dueno).toEqual(['admin', 'cashier', 'pos', 'kds', 'stock']);
  });

  it('Encargado gets all 5 modes', () => {
    expect(MODES_BY_ROLE.Encargado).toEqual(['admin', 'cashier', 'pos', 'kds', 'stock']);
  });

  it('Mozo gets only pos', () => {
    expect(MODES_BY_ROLE.Mozo).toEqual(['pos']);
  });

  it('Cocinero gets only kds', () => {
    expect(MODES_BY_ROLE.Cocinero).toEqual(['kds']);
  });
});

// ── Role-filtered rendering ─────────────────────────────────────────
describe('DeviceModeSelector — Dueno sees all modes', () => {
  it('renders all 5 mode cards for Dueno', () => {
    renderSelector('Dueno');
    for (const mode of VALID_MODES) {
      expect(screen.getByTestId(`mode-card-${mode}`)).toBeDefined();
    }
  });

  it('renders mode labels for Dueno', () => {
    renderSelector('Dueno');
    for (const mode of VALID_MODES) {
      expect(screen.getByText(MODE_LABELS[mode])).toBeDefined();
    }
  });
});

describe('DeviceModeSelector — Encargado sees all modes', () => {
  it('renders all 5 mode cards for Encargado', () => {
    renderSelector('Encargado');
    for (const mode of VALID_MODES) {
      expect(screen.getByTestId(`mode-card-${mode}`)).toBeDefined();
    }
  });
});

describe('DeviceModeSelector — Mozo auto-selects pos', () => {
  it('renders nothing (auto-selects single mode via useEffect)', () => {
    const onSelect = vi.fn();
    const { container } = renderSelector('Mozo', onSelect);
    // Component returns null for single-mode roles (cards.length <= 1)
    expect(container.innerHTML).toBe('');
  });

  it('sets pos mode in localStorage after effect fires', async () => {
    await act(async () => {
      renderSelector('Mozo');
    });
    expect(localStorageStub.getItem('mimenu_device_mode')).toBe('pos');
  });
});

describe('DeviceModeSelector — Cocinero auto-selects kds', () => {
  it('renders nothing (auto-selects single mode via useEffect)', () => {
    const { container } = renderSelector('Cocinero');
    expect(container.innerHTML).toBe('');
  });

  it('sets kds mode in localStorage after effect fires', async () => {
    await act(async () => {
      renderSelector('Cocinero');
    });
    expect(localStorageStub.getItem('mimenu_device_mode')).toBe('kds');
  });
});

describe('DeviceModeSelector — unknown role', () => {
  it('renders nothing for unknown role', () => {
    const { container } = renderSelector('FutureRole');
    expect(container.innerHTML).toBe('');
  });

  it('does not set any mode for unknown role', () => {
    renderSelector('FutureRole');
    expect(localStorageStub.getItem('mimenu_device_mode')).toBeNull();
  });
});

// ── Click behavior ──────────────────────────────────────────────────
describe('DeviceModeSelector — click behavior', () => {
  it('clicking a mode card sets the mode in localStorage', async () => {
    renderSelector('Dueno');
    const posCard = screen.getByTestId('mode-card-pos');
    await act(async () => { posCard.click(); });
    expect(localStorageStub.getItem('mimenu_device_mode')).toBe('pos');
  });

  it('clicking a mode calls onSelect callback', async () => {
    const onSelect = vi.fn();
    renderSelector('Dueno', onSelect);
    const cashierCard = screen.getByTestId('mode-card-cashier');
    await act(async () => { cashierCard.click(); });
    expect(onSelect).toHaveBeenCalledWith('cashier');
  });
});
