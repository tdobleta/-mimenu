// ── Test: CloseDetailModal — closed table detail view ────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ── Supabase mock ────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

function buildChain(resolvedData) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (cb) => Promise.resolve({ data: resolvedData, error: null }).then(cb),
  };
  return chain;
}

let turnItemsData = [];
let bizOpsData = [];

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'turn_items') return buildChain(turnItemsData);
      if (table === 'business_operations') return buildChain(bizOpsData);
      return buildChain([]);
    }),
  },
}));

vi.mock('@/lib/fmt', () => ({
  money: (v) => `$${Number(v || 0).toLocaleString('es-AR')}`,
}));

import CloseDetailModal from '@/components/caja/CloseDetailModal';

const baseTurn = {
  id: 'turn-1',
  mesa_num: 5,
  closed_at: '2026-05-28T14:30:00Z',
  mozo: 'Carlos',
  total_facturado: 8500,
  propina: 500,
  descuento: 1000,
  metodo_pago: 'Efectivo',
  pagos_detalle: null,
  caja_shift_id: 'shift-1',
};

const sampleItems = [
  { id: 'i1', menu_item_name: 'Milanesa', cantidad: 2, precio: 3000, notas: '', created_at: '2026-05-28T14:00:00Z' },
  { id: 'i2', menu_item_name: 'Gaseosa', cantidad: 1, precio: 1500, notas: 'sin hielo', created_at: '2026-05-28T14:01:00Z' },
  { id: 'i3', menu_item_name: 'Flan', cantidad: 1, precio: 2000, notas: '', created_at: '2026-05-28T14:02:00Z' },
];

describe('CloseDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    turnItemsData = [...sampleItems];
    bizOpsData = [];
  });

  it('renders turn header fields (mesa, date, mozo)', async () => {
    render(<CloseDetailModal turn={baseTurn} onClose={vi.fn()} />);

    expect(screen.getByText('Mesa 5')).toBeTruthy();
    expect(screen.getByText(/Carlos/)).toBeTruthy();
  });

  it('renders items after fetch resolves', async () => {
    render(<CloseDetailModal turn={baseTurn} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Milanesa')).toBeTruthy();
      expect(screen.getByText('Gaseosa')).toBeTruthy();
      expect(screen.getByText('Flan')).toBeTruthy();
    });

    // Check item notes
    expect(screen.getByText('sin hielo')).toBeTruthy();
  });

  it('renders pagos_detalle breakdown when present', async () => {
    const turnWithPagos = {
      ...baseTurn,
      metodo_pago: 'Mixto',
      pagos_detalle: [
        { metodo: 'Efectivo', monto: 5000 },
        { metodo: 'Tarjeta', monto: 3500 },
      ],
    };

    render(<CloseDetailModal turn={turnWithPagos} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Efectivo')).toBeTruthy();
      expect(screen.getByText('Tarjeta')).toBeTruthy();
    });
  });

  it('renders descuento and discount reason when available', async () => {
    bizOpsData = [{ payload: { pricing: { discount_reason: 'Cumpleaños cliente' } } }];

    render(<CloseDetailModal turn={baseTurn} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Descuento')).toBeTruthy();
      expect(screen.getByText(/Cumpleaños cliente/)).toBeTruthy();
    });
  });

  it('handles missing optional fields (no mozo, no descuento, no propina)', async () => {
    const minimalTurn = {
      id: 'turn-2',
      mesa_num: 1,
      closed_at: '2026-05-28T15:00:00Z',
      mozo: '',
      total_facturado: 3000,
      propina: 0,
      descuento: 0,
      metodo_pago: 'Tarjeta',
      pagos_detalle: null,
    };

    render(<CloseDetailModal turn={minimalTurn} onClose={vi.fn()} />);

    expect(screen.getByText('Mesa 1')).toBeTruthy();
    // Mozo should not render
    expect(screen.queryByText(/Mozo:/)).toBeNull();
    // Descuento and Propina rows should not appear
    expect(screen.queryByText('Descuento')).toBeNull();
    expect(screen.queryByText('Propina')).toBeNull();
  });

  it('handles fetch error without crashing', async () => {
    // Override to return error
    const { supabase } = await import('@/api/supabaseClient');
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (cb) => Promise.resolve({ data: null, error: { message: 'network error' } }).then(cb),
    }));

    render(<CloseDetailModal turn={baseTurn} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No se pudieron cargar los items/)).toBeTruthy();
    });

    // Turn-level data still visible
    expect(screen.getByText('Mesa 5')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<CloseDetailModal turn={baseTurn} onClose={onClose} />);

    const closeBtn = screen.getByText('Cerrar');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
