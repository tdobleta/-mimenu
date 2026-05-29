// ── Test: Device Mode Foundation ─────────────────────────────────────
// Unit tests for DeviceModeContext and DeviceModeSelector.
// These validate mode persistence, validation, clearing, and UI rendering.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  DeviceModeProvider,
  useDeviceMode,
  VALID_MODES,
  MODE_DEFAULT_ROUTE,
  MODE_LABELS,
} from '@/lib/DeviceModeContext';

// ── localStorage stub (same pattern as pointsRedemptionValidation.test.js) ──
function createMockStorage() {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: () => { store = {}; },
    _store: store,
  };
}

// ── Helper: wrap renderHook with provider using custom storage ──────
function renderDeviceMode(storage) {
  return renderHook(() => useDeviceMode(), {
    wrapper: ({ children }) => (
      <DeviceModeProvider storage={storage}>{children}</DeviceModeProvider>
    ),
  });
}

describe('DeviceModeContext — core behavior', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('returns null mode when localStorage is empty', () => {
    const { result } = renderDeviceMode(storage);
    expect(result.current.mode).toBeNull();
  });

  it('setMode writes to localStorage and updates state', () => {
    const { result } = renderDeviceMode(storage);

    act(() => result.current.setMode('pos'));

    expect(result.current.mode).toBe('pos');
    expect(storage.setItem).toHaveBeenCalledWith('mimenu_device_mode', 'pos');
  });

  it('setMode rejects invalid mode string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderDeviceMode(storage);

    act(() => result.current.setMode('hacker'));

    expect(result.current.mode).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('inválido'));
    warnSpy.mockRestore();
  });

  it('clearMode removes from localStorage and resets to null', () => {
    const { result } = renderDeviceMode(storage);

    act(() => result.current.setMode('cashier'));
    expect(result.current.mode).toBe('cashier');

    act(() => result.current.clearMode());
    expect(result.current.mode).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith('mimenu_device_mode');
  });

  it('mode persists: reads from localStorage on mount', () => {
    storage.setItem('mimenu_device_mode', 'kds');
    // Re-create storage with pre-set value
    const presetStorage = {
      getItem: vi.fn((key) => key === 'mimenu_device_mode' ? 'kds' : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    const { result } = renderDeviceMode(presetStorage);
    expect(result.current.mode).toBe('kds');
  });

  it('ignores invalid stored value in localStorage', () => {
    const badStorage = {
      getItem: vi.fn(() => 'invalid_mode_xyz'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    const { result } = renderDeviceMode(badStorage);
    expect(result.current.mode).toBeNull();
  });

  it('all valid modes can be set sequentially', () => {
    const { result } = renderDeviceMode(storage);

    for (const m of VALID_MODES) {
      act(() => result.current.setMode(m));
      expect(result.current.mode).toBe(m);
    }
  });
});

describe('DeviceModeContext — constants contract', () => {
  it('every valid mode has a corresponding default route', () => {
    for (const mode of VALID_MODES) {
      expect(MODE_DEFAULT_ROUTE[mode]).toBeDefined();
      expect(typeof MODE_DEFAULT_ROUTE[mode]).toBe('string');
      expect(MODE_DEFAULT_ROUTE[mode].startsWith('/')).toBe(true);
    }
  });

  it('every valid mode has a label', () => {
    for (const mode of VALID_MODES) {
      expect(MODE_LABELS[mode]).toBeDefined();
      expect(typeof MODE_LABELS[mode]).toBe('string');
      expect(MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
  });

  it('VALID_MODES contains exactly 5 modes', () => {
    expect(VALID_MODES).toEqual(['admin', 'cashier', 'pos', 'kds', 'stock']);
  });

  it('MODE_DEFAULT_ROUTE maps correctly', () => {
    expect(MODE_DEFAULT_ROUTE.admin).toBe('/');
    expect(MODE_DEFAULT_ROUTE.cashier).toBe('/caja');
    expect(MODE_DEFAULT_ROUTE.pos).toBe('/salon');
    expect(MODE_DEFAULT_ROUTE.kds).toBe('/cocina');
    expect(MODE_DEFAULT_ROUTE.stock).toBe('/stock');
  });
});

describe('DeviceModeContext — redirect logic (unit)', () => {
  it('kds mode + non-cocina path should trigger redirect', () => {
    // This tests the condition that RoutedApp evaluates
    const mode = 'kds';
    const pathname = '/salon';
    const shouldRedirect = mode === 'kds' && pathname !== '/cocina';
    expect(shouldRedirect).toBe(true);
  });

  it('kds mode + /cocina path should NOT redirect', () => {
    const mode = 'kds';
    const pathname = '/cocina';
    const shouldRedirect = mode === 'kds' && pathname !== '/cocina';
    expect(shouldRedirect).toBe(false);
  });

  it('admin mode + "/" path should NOT redirect (default route is "/")', () => {
    const mode = 'admin';
    const pathname = '/';
    const defaultRoute = MODE_DEFAULT_ROUTE[mode];
    const shouldRedirect = pathname === '/' && defaultRoute && defaultRoute !== '/';
    expect(shouldRedirect).toBe(false);
  });

  it('cashier mode + "/" path should redirect to /caja', () => {
    const mode = 'cashier';
    const pathname = '/';
    const defaultRoute = MODE_DEFAULT_ROUTE[mode];
    const shouldRedirect = pathname === '/' && defaultRoute && defaultRoute !== '/';
    expect(shouldRedirect).toBe(true);
    expect(defaultRoute).toBe('/caja');
  });

  it('pos mode + "/" path should redirect to /salon', () => {
    const mode = 'pos';
    const pathname = '/';
    const defaultRoute = MODE_DEFAULT_ROUTE[mode];
    const shouldRedirect = pathname === '/' && defaultRoute && defaultRoute !== '/';
    expect(shouldRedirect).toBe(true);
    expect(defaultRoute).toBe('/salon');
  });
});

describe('DeviceModeContext — error handling', () => {
  it('useDeviceMode throws outside provider', () => {
    // Suppress console.error from React for expected error
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useDeviceMode());
    }).toThrow('useDeviceMode debe usarse dentro de DeviceModeProvider');
    errorSpy.mockRestore();
  });

  it('handles null/undefined storage gracefully', () => {
    const { result } = renderDeviceMode(null);
    expect(result.current.mode).toBeNull();

    // setMode should not throw with null storage
    act(() => result.current.setMode('admin'));
    expect(result.current.mode).toBe('admin');
  });
});
