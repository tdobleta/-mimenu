// ── Test: FieldError component ────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FieldError from '@/components/ui/FieldError';

describe('FieldError', () => {
  it('renders error message when error is provided', () => {
    render(<FieldError error="El monto no puede ser negativo" />);
    expect(screen.getByRole('alert')).toHaveTextContent('El monto no puede ser negativo');
  });

  it('renders nothing when error is null', () => {
    const { container } = render(<FieldError error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when error is undefined', () => {
    const { container } = render(<FieldError error={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when error is empty string', () => {
    const { container } = render(<FieldError error="" />);
    expect(container.firstChild).toBeNull();
  });

  it('has role="alert" for accessibility', () => {
    render(<FieldError error="Error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
