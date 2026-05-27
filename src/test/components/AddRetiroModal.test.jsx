// ── Test: AddRetiroModal component ───────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────
const mockAddToast = vi.fn();
const mockOnClose = vi.fn();
const mockAddRetiro = vi.fn();
const mockLogAccion = vi.fn();

vi.mock('@/lib/store', () => ({
  useStore: () => ({
    turnoActivo: { id: 'shift-1', branchId: 'branch-1', fondoInicial: 10000, retiros: [] },
    branchId: 'branch-1',
    sucursales: [{ id: 'branch-1', nombre: 'Sucursal 1' }],
    restaurantId: 'rest-1',
    addRetiro: mockAddRetiro,
    logAccion: mockLogAccion,
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

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('@/lib/offlineQueue', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/useActiveStaff', () => ({
  getActiveStaff: () => ({ nombre: 'Test Staff' }),
  touchActiveStaff: vi.fn(),
}));

import AddRetiroModal from '@/components/caja/AddRetiroModal';

describe('AddRetiroModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal with title and fields', () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    expect(screen.getByText('Registrar retiro de caja')).toBeInTheDocument();
    expect(screen.getByText('Concepto')).toBeInTheDocument();
    expect(screen.getByText('Monto')).toBeInTheDocument();
  });

  it('renders concepto dropdown with 4 options', () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(4);
    expect(options[0].textContent).toBe('Retiro recaudación');
    expect(options[3].textContent).toBe('Otro');
  });

  it('shows "Otro" text input when Otro is selected', () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Otro' } });
    expect(screen.getByPlaceholderText(/Describí el concepto/)).toBeInTheDocument();
  });

  it('calls onClose when Cancelar is clicked', () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows validation error when monto is 0', async () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    // Registrar button is disabled when monto <= 0, so we set a negative value
    const montoInput = screen.getByPlaceholderText('0');
    fireEvent.change(montoInput, { target: { value: '-5' } });
    // Button should still be disabled (montoNum <= 0)
    const btn = screen.getByText('Registrar');
    expect(btn).toBeDisabled();
  });

  it('shows validation error for short "Otro" concepto', async () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Otro' } });
    const otroInput = screen.getByPlaceholderText(/Describí el concepto/);
    fireEvent.change(otroInput, { target: { value: 'ab' } }); // too short (min 4)
    const montoInput = screen.getByPlaceholderText('0');
    fireEvent.change(montoInput, { target: { value: '500' } });
    // Click confirm
    fireEvent.click(screen.getByText('Registrar'));
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Revisá los datos del retiro', 'error');
    });
  });

  it('calls supabase rpc on valid submission', async () => {
    const { supabase } = await import('@/api/supabaseClient');
    render(<AddRetiroModal onClose={mockOnClose} />);
    const montoInput = screen.getByPlaceholderText('0');
    fireEvent.change(montoInput, { target: { value: '1500' } });
    fireEvent.click(screen.getByText('Registrar'));
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('append_caja_retiro', expect.objectContaining({
        p_shift_id: 'shift-1',
      }));
    });
  });

  it('calls addRetiro and onClose on success', async () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    const montoInput = screen.getByPlaceholderText('0');
    fireEvent.change(montoInput, { target: { value: '2000' } });
    fireEvent.click(screen.getByText('Registrar'));
    await waitFor(() => {
      expect(mockAddRetiro).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Retiro registrado'), 'success');
    });
  });

  it('falls back to offline queue when rpc fails', async () => {
    const { supabase } = await import('@/api/supabaseClient');
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });
    const { enqueue } = await import('@/lib/offlineQueue');
    render(<AddRetiroModal onClose={mockOnClose} />);
    const montoInput = screen.getByPlaceholderText('0');
    fireEvent.change(montoInput, { target: { value: '800' } });
    fireEvent.click(screen.getByText('Registrar'));
    await waitFor(() => {
      expect(mockAddRetiro).toHaveBeenCalled();
      expect(enqueue).toHaveBeenCalled();
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('sin conexión'), 'warning');
    });
  });

  it('calls onClose when clicking backdrop', () => {
    const { container } = render(<AddRetiroModal onClose={mockOnClose} />);
    // Click on the fixed backdrop (outermost div)
    fireEvent.click(container.firstChild);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('does NOT close when clicking modal panel', () => {
    render(<AddRetiroModal onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Registrar retiro de caja'));
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
