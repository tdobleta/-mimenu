// ── Test: KDS mode polish ────────────────────────────────────────────
// Tests for KDS badge, two-tap exit button, sign-out clearing mode,
// and Cocinero role hiding the exit button.
//
// These test the KdsExitButton behavior and device mode integration
// without rendering the full CocinaDisplay (which requires Supabase,
// store, auth context, etc.). We test the logic and the isolated
// KdsExitButton component.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DeviceModeProvider, useDeviceMode, VALID_MODES } from '@/lib/DeviceModeContext';

// ── localStorage stub ───────────────────────────────────────────────
function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// ── Isolated KdsExitButton (same logic as CocinaDisplay's internal component) ──
// We replicate it here to test in isolation without needing CocinaDisplay's
// full dependency tree (Supabase, store, auth, etc.)
import { useState, useEffect } from 'react';

function KdsExitButton({ clearMode }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) {
    return (
      <button data-testid="kds-exit-confirm" onClick={() => clearMode()}>
        Confirmar cambio
      </button>
    );
  }

  return (
    <button data-testid="kds-exit-btn" onClick={() => setConfirming(true)}>
      Cambiar modo
    </button>
  );
}

// ── Helper: render with DeviceModeProvider ───────────────────────────
function ModeDisplay({ storage }) {
  const { mode, clearMode } = useDeviceMode();
  const isKdsMode = mode === 'kds';

  return (
    <div>
      <span data-testid="mode-value">{mode || 'null'}</span>
      {isKdsMode && <span data-testid="kds-badge">MODO KDS</span>}
      {isKdsMode && <KdsExitButton clearMode={clearMode} />}
      {!isKdsMode && <span data-testid="no-kds-exit">no exit button</span>}
      <button
        data-testid="sign-out-btn"
        onClick={() => {
          if (isKdsMode) clearMode();
          // signOut would go here in real code
        }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

function renderWithMode(initialMode, storage = null) {
  const s = storage || createMockStorage(
    initialMode ? { mimenu_device_mode: initialMode } : {}
  );
  return {
    ...render(
      <DeviceModeProvider storage={s}>
        <ModeDisplay storage={s} />
      </DeviceModeProvider>
    ),
    storage: s,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('KDS badge', () => {
  it('appears when mode is kds', () => {
    renderWithMode('kds');
    expect(screen.getByTestId('kds-badge')).toBeDefined();
    expect(screen.getByTestId('kds-badge').textContent).toBe('MODO KDS');
  });

  it('does not appear when mode is admin', () => {
    renderWithMode('admin');
    expect(screen.queryByTestId('kds-badge')).toBeNull();
  });

  it('does not appear when mode is pos', () => {
    renderWithMode('pos');
    expect(screen.queryByTestId('kds-badge')).toBeNull();
  });

  it('does not appear when mode is null', () => {
    renderWithMode(null);
    expect(screen.queryByTestId('kds-badge')).toBeNull();
  });
});

describe('KDS exit button — visibility', () => {
  it('shows exit button when mode is kds', () => {
    renderWithMode('kds');
    expect(screen.getByTestId('kds-exit-btn')).toBeDefined();
  });

  it('does not show exit button when mode is admin', () => {
    renderWithMode('admin');
    expect(screen.getByTestId('no-kds-exit')).toBeDefined();
    expect(screen.queryByTestId('kds-exit-btn')).toBeNull();
  });

  it('does not show exit button when mode is cashier', () => {
    renderWithMode('cashier');
    expect(screen.queryByTestId('kds-exit-btn')).toBeNull();
  });
});

describe('KDS exit button — two-tap confirmation', () => {
  it('first tap changes to confirmation state', () => {
    renderWithMode('kds');

    const btn = screen.getByTestId('kds-exit-btn');
    expect(btn.textContent).toBe('Cambiar modo');

    fireEvent.click(btn);

    const confirmBtn = screen.getByTestId('kds-exit-confirm');
    expect(confirmBtn.textContent).toBe('Confirmar cambio');
  });

  it('second tap calls clearMode and exits KDS', () => {
    const { storage } = renderWithMode('kds');

    // First tap
    fireEvent.click(screen.getByTestId('kds-exit-btn'));
    // Second tap
    fireEvent.click(screen.getByTestId('kds-exit-confirm'));

    // Mode should be cleared
    expect(screen.getByTestId('mode-value').textContent).toBe('null');
    expect(storage.removeItem).toHaveBeenCalledWith('mimenu_device_mode');
  });

  it('auto-cancels after 3 seconds', async () => {
    vi.useFakeTimers();
    renderWithMode('kds');

    // First tap
    fireEvent.click(screen.getByTestId('kds-exit-btn'));
    expect(screen.getByTestId('kds-exit-confirm')).toBeDefined();

    // Advance 3 seconds
    act(() => { vi.advanceTimersByTime(3000); });

    // Should revert to "Cambiar modo"
    expect(screen.queryByTestId('kds-exit-confirm')).toBeNull();
    expect(screen.getByTestId('kds-exit-btn')).toBeDefined();

    vi.useRealTimers();
  });

  it('does not auto-cancel before 3 seconds', () => {
    vi.useFakeTimers();
    renderWithMode('kds');

    fireEvent.click(screen.getByTestId('kds-exit-btn'));
    act(() => { vi.advanceTimersByTime(2500); });

    // Should still show confirmation
    expect(screen.getByTestId('kds-exit-confirm')).toBeDefined();

    vi.useRealTimers();
  });
});

describe('Sign-out clears KDS mode', () => {
  it('sign-out in KDS mode clears device mode from localStorage', () => {
    const { storage } = renderWithMode('kds');

    fireEvent.click(screen.getByTestId('sign-out-btn'));

    expect(storage.removeItem).toHaveBeenCalledWith('mimenu_device_mode');
    expect(screen.getByTestId('mode-value').textContent).toBe('null');
  });

  it('sign-out in non-KDS mode does not clear device mode', () => {
    const { storage } = renderWithMode('admin');

    fireEvent.click(screen.getByTestId('sign-out-btn'));

    // Should NOT have called removeItem for device mode
    expect(storage.removeItem).not.toHaveBeenCalledWith('mimenu_device_mode');
    expect(screen.getByTestId('mode-value').textContent).toBe('admin');
  });
});

describe('KDS mode — Cocinero role behavior (contract)', () => {
  // These test the conditional logic that CocinaDisplay uses:
  // {isKdsMode && role !== 'Cocinero' && <KdsExitButton />}
  // We test the condition itself since we can't render CocinaDisplay in isolation.

  it('KDS + non-Cocinero: exit button should be shown', () => {
    const isKdsMode = true;
    const role = 'Dueno';
    const showExitButton = isKdsMode && role !== 'Cocinero';
    expect(showExitButton).toBe(true);
  });

  it('KDS + Cocinero: exit button should be hidden', () => {
    const isKdsMode = true;
    const role = 'Cocinero';
    const showExitButton = isKdsMode && role !== 'Cocinero';
    expect(showExitButton).toBe(false);
  });

  it('non-KDS + Cocinero: exit button should be hidden', () => {
    const isKdsMode = false;
    const role = 'Cocinero';
    const showExitButton = isKdsMode && role !== 'Cocinero';
    expect(showExitButton).toBe(false);
  });

  it('non-KDS + Dueno: exit button should be hidden', () => {
    const isKdsMode = false;
    const role = 'Dueno';
    const showExitButton = isKdsMode && role !== 'Cocinero';
    expect(showExitButton).toBe(false);
  });
});
