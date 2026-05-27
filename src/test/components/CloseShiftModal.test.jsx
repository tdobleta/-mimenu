// ── Test: CloseShiftModal component ──────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────
const mockAddToast = vi.fn();
const mockOnClose = vi.fn();
const mockOnClosed = vi.fn();
const mockCerrarTurnoActivo = vi.fn();
const mockRefreshCharts = vi.fn();

vi.mock('@/lib/store', () => ({
  useStore: () => ({
    turnoActivo: { id: 'shift-1', branchId: 'branch-1' },
    branchId: 'branch-1',
    restaurantId: 'rest-1',
    cerrarTurnoActivo: mockCerrarTurnoActivo,
    refreshCharts: mockRefreshCharts,
  }),
}));

vi.mock('@/lib/toast', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'test@test.com', role: 'admin' } }),
}));

vi.mock('@/lib/useUserRole', () => ({
  default: () => 'Dueno',
}));

vi.mock('@/lib/useActiveStaff', () => ({
  getActiveStaff: () => ({ nombre: 'Test Staff' }),
  touchActiveStaff: vi.fn(),
}));

const mockCloseShiftOp = vi.fn().mockResolvedValue({ diferencia_caja: 0 });

vi.mock('@/lib/cajaShiftOperations', () => ({
  createCloseShiftOperationId: vi.fn(() => 'close-op-1'),
  closeCajaShiftOperation: (...args) => mockCloseShiftOp(...args),
}));

import CloseShiftModal from '@/components/caja/CloseShiftModal';

const defaultProps = {
  ventasPorMetodo: { Efectivo: 8000, Tarjeta: 5000 },
  totalVentas: 13000,
  retirosTotales: 2000,
  efectivoEsperado: 16000,
  tipoTurno: 'manana',
  mesasAbiertas: 0,
  onClose: mockOnClose,
  onClosed: mockOnClosed,
};

describe('CloseShiftModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders summary with ventas totals', () => {
    render(<CloseShiftModal {...defaultProps} />);
    expect(screen.getByText('Resumen del turno')).toBeInTheDocument();
    expect(screen.getByText('Manana')).toBeInTheDocument(); // tipoLabel
    expect(screen.getByText('Total facturado')).toBeInTheDocument();
    expect(screen.getByText('Total retiros')).toBeInTheDocument();
  });

  it('renders ventas por método rows', () => {
    render(<CloseShiftModal {...defaultProps} />);
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
  });

  it('renders arqueo input', () => {
    render(<CloseShiftModal {...defaultProps} />);
    expect(screen.getByText('Conteo fisico de caja')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0')).toBeInTheDocument();
  });

  it('shows warning when mesasAbiertas > 0', () => {
    render(<CloseShiftModal {...defaultProps} mesasAbiertas={3} />);
    expect(screen.getByText(/Hay 3 mesas abiertas/)).toBeInTheDocument();
  });

  it('does NOT show warning when mesasAbiertas is 0', () => {
    render(<CloseShiftModal {...defaultProps} mesasAbiertas={0} />);
    expect(screen.queryByText(/mesas abiertas/)).not.toBeInTheDocument();
  });

  it('shows "La caja cuadra" when arqueo matches expected', () => {
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '16000' } });
    expect(screen.getByText('La caja cuadra perfectamente')).toBeInTheDocument();
  });

  it('shows "Sobran" when arqueo > expected', () => {
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '17000' } });
    expect(screen.getByText(/Sobran/)).toBeInTheDocument();
  });

  it('shows "Faltan" when arqueo < expected', () => {
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '15000' } });
    expect(screen.getByText(/Faltan/)).toBeInTheDocument();
  });

  it('shows motivo field when there is a difference', () => {
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '15000' } });
    expect(screen.getByText('Motivo de la diferencia (opcional)')).toBeInTheDocument();
  });

  it('does NOT show motivo field when caja cuadra', () => {
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '16000' } });
    expect(screen.queryByText('Motivo de la diferencia')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancelar is clicked', () => {
    render(<CloseShiftModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('successfully closes shift', async () => {
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '16000' } });
    fireEvent.click(screen.getByText('Cerrar turno y guardar'));
    await waitFor(() => {
      expect(mockCloseShiftOp).toHaveBeenCalledWith(expect.objectContaining({
        shiftId: 'shift-1',
        arqueoEfectivo: 16000,
      }));
      expect(mockCerrarTurnoActivo).toHaveBeenCalled();
      expect(mockRefreshCharts).toHaveBeenCalled();
      expect(mockOnClosed).toHaveBeenCalled();
    });
  });

  it('shows success toast when caja cuadra on close', async () => {
    mockCloseShiftOp.mockResolvedValueOnce({ diferencia_caja: 0 });
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '16000' } });
    fireEvent.click(screen.getByText('Cerrar turno y guardar'));
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('cuadra'), 'success');
    });
  });

  it('shows info toast when there is a surplus', async () => {
    mockCloseShiftOp.mockResolvedValueOnce({ diferencia_caja: 500 });
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '16500' } });
    fireEvent.click(screen.getByText('Cerrar turno y guardar'));
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Sobraron'), 'info');
    });
  });

  it('shows info toast when there is a deficit', async () => {
    mockCloseShiftOp.mockResolvedValueOnce({ diferencia_caja: -300 });
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '15700' } });
    fireEvent.click(screen.getByText('Cerrar turno y guardar'));
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Faltaron'), 'info');
    });
  });

  it('shows error when close operation fails', async () => {
    mockCloseShiftOp.mockRejectedValueOnce(new Error('network error'));
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '16000' } });
    fireEvent.click(screen.getByText('Cerrar turno y guardar'));
    await waitFor(() => {
      expect(screen.getByText(/No se pudo cerrar el turno/)).toBeInTheDocument();
    });
  });

  it('shows specific error for open tables', async () => {
    mockCloseShiftOp.mockRejectedValueOnce(new Error('hay mesas abiertas'));
    render(<CloseShiftModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '16000' } });
    fireEvent.click(screen.getByText('Cerrar turno y guardar'));
    await waitFor(() => {
      expect(screen.getByText(/mesas abiertas/)).toBeInTheDocument();
    });
  });
});
