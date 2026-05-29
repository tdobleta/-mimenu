// ── Test: DeviceModeSelector component ──────────────────────────────
// Renders the mode selector and validates click behavior.
//
// NOTE: If this test fails with "@/components" alias resolution errors,
// it's the same pre-existing issue that affects all component tests
// (see CloseShiftModal.test.jsx, CloseTableModal.test.jsx).
// The DeviceModeContext unit tests in deviceMode.test.js cover the
// core logic independently.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeviceModeProvider, VALID_MODES, MODE_LABELS } from '@/lib/DeviceModeContext';
import DeviceModeSelector from '@/components/DeviceModeSelector';

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

function renderSelector(onSelect = undefined) {
  return render(
    <DeviceModeProvider>
      <DeviceModeSelector onSelect={onSelect} />
    </DeviceModeProvider>
  );
}

describe('DeviceModeSelector', () => {
  beforeEach(() => {
    localStorageStub.clear();
  });

  it('renders all 5 mode cards', () => {
    renderSelector();

    for (const mode of VALID_MODES) {
      const card = screen.getByTestId(`mode-card-${mode}`);
      expect(card).toBeDefined();
    }
  });

  it('renders mode labels', () => {
    renderSelector();

    for (const mode of VALID_MODES) {
      const label = MODE_LABELS[mode];
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('displays the setup heading', () => {
    renderSelector();
    expect(screen.getByText('Configurar este dispositivo')).toBeDefined();
  });

  it('clicking a mode card sets the mode in localStorage', () => {
    renderSelector();

    const posCard = screen.getByTestId('mode-card-pos');
    fireEvent.click(posCard);

    expect(localStorageStub.getItem('mimenu_device_mode')).toBe('pos');
  });

  it('clicking a mode calls onSelect callback', () => {
    const onSelect = vi.fn();
    renderSelector(onSelect);

    const cashierCard = screen.getByTestId('mode-card-cashier');
    fireEvent.click(cashierCard);

    expect(onSelect).toHaveBeenCalledWith('cashier');
  });

  it('shows hint about permissions depending on role', () => {
    renderSelector();
    expect(screen.getByText(/preferencia de navegación/)).toBeDefined();
  });
});
