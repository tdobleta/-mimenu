// ── Test: PWAInstallPrompt component ────────────────────────────────
// Tests rendering, install action, dismiss, iOS guide, and hidden states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mock usePWAInstall ──────────────────────────────────────────────
const mockPromptInstall = vi.fn();
const mockDismiss = vi.fn();
let hookReturn = {};

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => hookReturn,
}));

import PWAInstallPrompt from '@/components/PWAInstallPrompt';

beforeEach(() => {
  vi.clearAllMocks();
  hookReturn = {
    canInstall: false,
    isInstalled: false,
    isIOS: false,
    showIOSGuide: false,
    promptInstall: mockPromptInstall,
    dismiss: mockDismiss,
  };
});

// ── Rendering ───────────────────────────────────────────────────────
describe('PWAInstallPrompt — rendering', () => {
  it('renders nothing when canInstall and showIOSGuide are both false', () => {
    const { container } = render(<PWAInstallPrompt />);
    expect(container.innerHTML).toBe('');
  });

  it('renders install banner when canInstall is true', () => {
    hookReturn.canInstall = true;
    render(<PWAInstallPrompt />);
    expect(screen.getByTestId('pwa-install-banner')).toBeTruthy();
    expect(screen.getByTestId('pwa-install-btn')).toBeTruthy();
    expect(screen.getByText('Instalá mimenú')).toBeTruthy();
  });

  it('renders iOS banner when showIOSGuide is true', () => {
    hookReturn.showIOSGuide = true;
    hookReturn.isIOS = true;
    render(<PWAInstallPrompt />);
    expect(screen.getByTestId('pwa-install-banner')).toBeTruthy();
    expect(screen.getByTestId('pwa-ios-guide-btn')).toBeTruthy();
    expect(screen.getByText('Agregá mimenú a inicio')).toBeTruthy();
  });

  it('does not render when isInstalled is true', () => {
    hookReturn.isInstalled = true;
    const { container } = render(<PWAInstallPrompt />);
    expect(container.innerHTML).toBe('');
  });
});

// ── Actions ─────────────────────────────────────────────────────────
describe('PWAInstallPrompt — actions', () => {
  it('clicking install button calls promptInstall', () => {
    hookReturn.canInstall = true;
    render(<PWAInstallPrompt />);
    fireEvent.click(screen.getByTestId('pwa-install-btn'));
    expect(mockPromptInstall).toHaveBeenCalledOnce();
  });

  it('clicking dismiss calls dismiss', () => {
    hookReturn.canInstall = true;
    render(<PWAInstallPrompt />);
    fireEvent.click(screen.getByTestId('pwa-dismiss-btn'));
    expect(mockDismiss).toHaveBeenCalledOnce();
  });

  it('dismiss also works on iOS banner', () => {
    hookReturn.showIOSGuide = true;
    hookReturn.isIOS = true;
    render(<PWAInstallPrompt />);
    fireEvent.click(screen.getByTestId('pwa-dismiss-btn'));
    expect(mockDismiss).toHaveBeenCalledOnce();
  });
});

// ── iOS Guide Dialog ────────────────────────────────────────────────
describe('PWAInstallPrompt — iOS guide dialog', () => {
  it('opens iOS guide when "Ver cómo" is clicked', () => {
    hookReturn.showIOSGuide = true;
    hookReturn.isIOS = true;
    render(<PWAInstallPrompt />);

    fireEvent.click(screen.getByTestId('pwa-ios-guide-btn'));

    // Dialog content should now be visible
    expect(screen.getByText('Instalar mimenú')).toBeTruthy();
    expect(screen.getByText('Entendido')).toBeTruthy();
  });

  it('closing iOS guide calls dismiss', () => {
    hookReturn.showIOSGuide = true;
    hookReturn.isIOS = true;
    render(<PWAInstallPrompt />);

    fireEvent.click(screen.getByTestId('pwa-ios-guide-btn'));
    fireEvent.click(screen.getByText('Entendido'));

    expect(mockDismiss).toHaveBeenCalledOnce();
  });
});
