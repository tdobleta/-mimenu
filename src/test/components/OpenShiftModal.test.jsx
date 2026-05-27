// ── Test: OpenShiftModal component ───────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────
const mockAddToast = vi.fn();
const mockOnClose = vi.fn();
const mockSetTurnoActivo = vi.fn();

vi.mock('@/lib/store', () => ({
  useStore: () => ({
    restaurantId: 'rest-1',
    branchId: 'branch-1',
    sucursales: [{ id: 'branch-1', nombre: 'Sucursal 1' }],
    turnoActivo: null,
    setTurnoActivo: mockSetTurnoActivo,
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

const mockOpenShiftOp = vi.fn().mockResolvedValue({
  caja_shift_id: 'new-shift-1',
  fondo_inicial: 5000,
  abierto_at: new Date().toISOString(),
  tipo_turno: 'manana',
});

vi.mock('@/lib/cajaShiftOperations', () => ({
  createOpenShiftOperationId: vi.fn(() => 'op-123'),
  openCajaShiftOperation: (...args) => mockOpenShiftOp(...args),
}));

import OpenShiftModal from '@/components/caja/OpenShiftModal';

describe('OpenShiftModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal with title and shift types', () => {
    render(<OpenShiftModal onClose={mockOnClose} />);
    // Title is a span, button also says "Abrir turno"
    expect(screen.getAllByText('Abrir turno')).toHaveLength(2);
    expect(screen.getByText('Tipo de turno')).toBeInTheDocument();
    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(screen.getByText('Noche')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('renders fondo input and buttons', () => {
    render(<OpenShiftModal onClose={mockOnClose} />);
    expect(screen.getByText('Fondo de caja inicial')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
    expect(screen.getByText('Abrir turno', { selector: 'button' })).toBeInTheDocument();
  });

  it('shows summary with selected turno and fondo', () => {
    render(<OpenShiftModal onClose={mockOnClose} />);
    // Mañana appears in button + summary <strong>, just check both exist
    const mananas = screen.getAllByText(/Mañana/);
    expect(mananas.length).toBeGreaterThanOrEqual(2); // button + summary
  });

  it('allows changing turno type', () => {
    render(<OpenShiftModal onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Noche'));
    // Summary should now show Noche
    const summaryDiv = screen.getByText((_, el) =>
      el?.tagName === 'STRONG' && el?.textContent === 'Noche'
    );
    expect(summaryDiv).toBeInTheDocument();
  });

  it('calls onClose when Cancelar is clicked', () => {
    render(<OpenShiftModal onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows validation error for negative fondo', async () => {
    render(<OpenShiftModal onClose={mockOnClose} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '-100' } });
    // Click the "Abrir turno" button (the one inside the panel, not the title)
    const buttons = screen.getAllByText('Abrir turno');
    const confirmBtn = buttons.find(el => el.tagName === 'BUTTON');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Revisá los datos del turno', 'error');
    });
  });

  it('successfully opens shift with valid data', async () => {
    render(<OpenShiftModal onClose={mockOnClose} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '5000' } });
    const buttons = screen.getAllByText('Abrir turno');
    const confirmBtn = buttons.find(el => el.tagName === 'BUTTON');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockOpenShiftOp).toHaveBeenCalledWith(expect.objectContaining({
        branchId: 'branch-1',
        fondoInicial: 5000,
        tipoTurno: 'manana',
      }));
      expect(mockSetTurnoActivo).toHaveBeenCalled();
      expect(mockAddToast).toHaveBeenCalledWith('Turno abierto correctamente', 'success');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('shows error toast when operation fails', async () => {
    mockOpenShiftOp.mockRejectedValueOnce(new Error('Connection failed'));
    render(<OpenShiftModal onClose={mockOnClose} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '1000' } });
    const buttons = screen.getAllByText('Abrir turno');
    const confirmBtn = buttons.find(el => el.tagName === 'BUTTON');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('No se pudo abrir'), 'error');
    });
  });

  it('shows duplicate warning for 23505 error', async () => {
    mockOpenShiftOp.mockRejectedValueOnce({ code: '23505', message: 'duplicate' });
    render(<OpenShiftModal onClose={mockOnClose} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '1000' } });
    const buttons = screen.getAllByText('Abrir turno');
    const confirmBtn = buttons.find(el => el.tagName === 'BUTTON');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Ya existe un turno abierto'), 'warning');
    });
  });

  it('calls onClose when clicking backdrop', () => {
    const { container } = render(<OpenShiftModal onClose={mockOnClose} />);
    fireEvent.click(container.firstChild);
    expect(mockOnClose).toHaveBeenCalled();
  });
});
