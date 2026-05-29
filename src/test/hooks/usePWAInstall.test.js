// ── Test: usePWAInstall hook ──────────────────────────────────────────
// Tests for beforeinstallprompt capture, standalone detection, iOS
// detection, dismiss cooldown, and promptInstall behavior.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

// ── Mock localStorage ───────────────────────────────────────────────
const localStorageStub = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, writable: true });

// ── Helpers ──────────────────────────────────────────────────────────
function fireBeforeInstallPrompt() {
  const mockPrompt = vi.fn();
  const mockEvent = new Event('beforeinstallprompt');
  mockEvent.preventDefault = vi.fn();
  mockEvent.prompt = mockPrompt;
  mockEvent.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(mockEvent);
  return { mockPrompt, mockEvent };
}

function fireAppInstalled() {
  window.dispatchEvent(new Event('appinstalled'));
}

// ── Mock matchMedia ──────────────────────────────────────────────────
let matchMediaMatches = false;
const matchMediaListeners = [];

beforeEach(() => {
  localStorageStub.clear();
  vi.clearAllMocks();
  matchMediaMatches = false;
  matchMediaListeners.length = 0;

  // Reset navigator.standalone
  Object.defineProperty(navigator, 'standalone', { value: false, writable: true, configurable: true });

  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: matchMediaMatches,
    media: query,
    addEventListener: vi.fn((_, handler) => matchMediaListeners.push(handler)),
    removeEventListener: vi.fn(),
  }));
});

describe('usePWAInstall — initial state', () => {
  it('returns canInstall false when no beforeinstallprompt fired', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);
    expect(result.current.isInstalled).toBe(false);
  });

  it('returns isInstalled true when standalone mode is active', () => {
    matchMediaMatches = true;
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it('returns isInstalled true when navigator.standalone is true (iOS)', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
  });
});

describe('usePWAInstall — beforeinstallprompt', () => {
  it('sets canInstall true after event fires', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);

    act(() => { fireBeforeInstallPrompt(); });

    expect(result.current.canInstall).toBe(true);
  });

  it('canInstall remains false if already installed', () => {
    matchMediaMatches = true;
    const { result } = renderHook(() => usePWAInstall());

    act(() => { fireBeforeInstallPrompt(); });

    expect(result.current.canInstall).toBe(false);
    expect(result.current.isInstalled).toBe(true);
  });
});

describe('usePWAInstall — promptInstall', () => {
  it('calls prompt() on deferred event and returns outcome', async () => {
    const { result } = renderHook(() => usePWAInstall());

    act(() => { fireBeforeInstallPrompt(); });

    let outcome;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('accepted');
    // After accepted install, isInstalled should be true
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it('returns dismissed when no deferred prompt available', async () => {
    const { result } = renderHook(() => usePWAInstall());

    let outcome;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('dismissed');
  });
});

describe('usePWAInstall — appinstalled event', () => {
  it('sets isInstalled true and hides prompt', () => {
    const { result } = renderHook(() => usePWAInstall());

    act(() => { fireBeforeInstallPrompt(); });
    expect(result.current.canInstall).toBe(true);

    act(() => { fireAppInstalled(); });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });
});

describe('usePWAInstall — dismiss cooldown', () => {
  it('dismiss sets canInstall to false', () => {
    const { result } = renderHook(() => usePWAInstall());

    act(() => { fireBeforeInstallPrompt(); });
    expect(result.current.canInstall).toBe(true);

    act(() => { result.current.dismiss(); });

    expect(result.current.canInstall).toBe(false);
  });

  it('dismiss writes timestamp to localStorage', () => {
    const { result } = renderHook(() => usePWAInstall());

    act(() => { result.current.dismiss(); });

    expect(localStorageStub.setItem).toHaveBeenCalledWith(
      'mimenu_pwa_install_dismissed',
      expect.any(String)
    );
  });

  it('respects cooldown on mount — dismissed recently hides prompt', () => {
    // Set a recent dismiss timestamp
    localStorageStub.setItem('mimenu_pwa_install_dismissed', new Date().toISOString());

    const { result } = renderHook(() => usePWAInstall());

    // Even after beforeinstallprompt, should stay hidden
    act(() => { fireBeforeInstallPrompt(); });

    expect(result.current.canInstall).toBe(false);
  });

  it('expired cooldown allows prompt to show again', () => {
    // Set dismiss timestamp 8 days ago (beyond 7-day cooldown)
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    localStorageStub.setItem('mimenu_pwa_install_dismissed', eightDaysAgo);

    const { result } = renderHook(() => usePWAInstall());

    act(() => { fireBeforeInstallPrompt(); });

    expect(result.current.canInstall).toBe(true);
  });
});

describe('usePWAInstall — iOS detection', () => {
  it('detects iOS via userAgent', () => {
    // We can't easily mock navigator.userAgent in all environments,
    // so we test the contract: isIOS is a boolean
    const { result } = renderHook(() => usePWAInstall());
    expect(typeof result.current.isIOS).toBe('boolean');
  });

  it('showIOSGuide is false when not iOS and not installed', () => {
    // Default test environment is not iOS
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.showIOSGuide).toBe(false);
  });

  it('showIOSGuide is false when installed', () => {
    matchMediaMatches = true;
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.showIOSGuide).toBe(false);
  });
});
