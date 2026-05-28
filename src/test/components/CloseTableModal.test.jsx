// ── Test: CloseTableModal double-submit prevention ──────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── localStorage stub (jsdom may not provide it) ─────────────────────────
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

// ── Mocks ────────────────────────────────────────────────────────────────
const mockAddToast = vi.fn();

vi.mock('@/lib/store', () => ({
  useStore: () => ({
    restaurantId: 'rest-1',
    branchId: 'branch-1',
    loyalty: null,
  }),
}));

vi.mock('@/lib/toast', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/lib/printer', () => ({
  getPrinterConfig: () => ({ autoPrintRecibo: false }),
  printReceipt: vi.fn(),
}));

vi.mock('@/api/supabaseClient', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));

vi.mock('@/lib/crmApi', () => ({
  searchCustomers: vi.fn().mockResolvedValue([]),
  addCustomerVisit: vi.fn(),
}));

vi.mock('@/lib/schemas/closeTable', () => ({
  closeTableSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

vi.mock('@/components/ui/FieldError', () => ({
  default: () => null,
}));

import CloseTableModal from '@/components/salon/CloseTableModal';

const defaultProps = {
  table: { id: 't1', num: 1, turnId: 'turn-1', mozo: 'Juan', order: [{ nombre: 'Café', precio: 500, qty: 1 }] },
  total: 500,
  branchId: 'branch-1',
  onClose: vi.fn(),
  onConfirmWithDiscount: vi.fn(),
};

describe('CloseTableModal — double-submit prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onConfirmWithDiscount.mockReset();
  });

  it('disables confirm button and shows "Cerrando..." while submitting', async () => {
    // Make onConfirmWithDiscount hang so we can observe the submitting state
    let resolveClose;
    defaultProps.onConfirmWithDiscount.mockImplementation(
      () => new Promise(resolve => { resolveClose = resolve; })
    );

    render(<CloseTableModal {...defaultProps} />);

    const confirmBtn = screen.getByText('Confirmar y cerrar mesa');
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    // Button should now show "Cerrando..." and be disabled
    await waitFor(() => {
      const btn = screen.getByText('Cerrando...');
      expect(btn).toBeDisabled();
    });

    // onConfirmWithDiscount called exactly once
    expect(defaultProps.onConfirmWithDiscount).toHaveBeenCalledTimes(1);

    // Resolve to clean up
    resolveClose();
  });

  it('ignores second click while first submission is in flight', async () => {
    let resolveClose;
    defaultProps.onConfirmWithDiscount.mockImplementation(
      () => new Promise(resolve => { resolveClose = resolve; })
    );

    render(<CloseTableModal {...defaultProps} />);

    const confirmBtn = screen.getByText('Confirmar y cerrar mesa');

    // Rapid double-click
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Cerrando...')).toBeDisabled();
    });

    // Only one call despite two clicks
    expect(defaultProps.onConfirmWithDiscount).toHaveBeenCalledTimes(1);

    resolveClose();
  });

  it('resets isSubmitting when onConfirmWithDiscount throws', async () => {
    defaultProps.onConfirmWithDiscount.mockRejectedValueOnce(new Error('turno ya cerrado'));

    render(<CloseTableModal {...defaultProps} />);

    const confirmBtn = screen.getByText('Confirmar y cerrar mesa');
    fireEvent.click(confirmBtn);

    // After error, button should be clickable again
    await waitFor(() => {
      expect(screen.getByText('Confirmar y cerrar mesa')).not.toBeDisabled();
    });

    expect(defaultProps.onConfirmWithDiscount).toHaveBeenCalledTimes(1);
  });
});
