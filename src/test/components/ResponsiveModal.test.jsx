// ── Test: ResponsiveModal component ───────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResponsiveModal from '@/components/ui/ResponsiveModal';

describe('ResponsiveModal', () => {
  it('renders children', () => {
    render(
      <ResponsiveModal maxW={400} onClose={() => {}}>
        <p>Contenido del modal</p>
      </ResponsiveModal>
    );
    expect(screen.getByText('Contenido del modal')).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ResponsiveModal maxW={400} onClose={onClose}>
        <p>Content</p>
      </ResponsiveModal>
    );
    // Click on the backdrop (the fixed outer div)
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT close when modal content is clicked', () => {
    const onClose = vi.fn();
    render(
      <ResponsiveModal maxW={400} onClose={onClose}>
        <p>Content</p>
      </ResponsiveModal>
    );
    fireEvent.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <ResponsiveModal maxW={400} onClose={onClose}>
        <p>Content</p>
      </ResponsiveModal>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('applies maxW style correctly', () => {
    render(
      <ResponsiveModal maxW={600} onClose={() => {}}>
        <p>Content</p>
      </ResponsiveModal>
    );
    const panel = screen.getByText('Content').closest('[style]');
    const style = panel.getAttribute('style');
    expect(style).toContain('600');
  });

  it('uses default maxW when not provided', () => {
    render(
      <ResponsiveModal onClose={() => {}}>
        <p>Content</p>
      </ResponsiveModal>
    );
    const panel = screen.getByText('Content').closest('[style]');
    const style = panel.getAttribute('style');
    // default maxW is 460
    expect(style).toContain('460');
  });
});
