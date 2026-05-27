// ── Test: useBreakpoint hooks ─────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBreakpoint, useIsMobile, useIsPortrait } from '@/hooks/useBreakpoint';

// Mock matchMedia for jsdom (needed by useIsPortrait)
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(orientation: portrait)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
});

describe('useBreakpoint', () => {
  beforeEach(() => {
    // Reset to desktop
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
  });

  it('returns xl for width >= 1280', () => {
    window.innerWidth = 1280;
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('xl');
  });

  it('returns lg for width >= 1024 and < 1280', () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('lg');
  });

  it('returns md for width >= 768 and < 1024', () => {
    window.innerWidth = 768;
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('md');
  });

  it('returns sm for width < 768', () => {
    window.innerWidth = 375;
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('sm');
  });
});

describe('useIsMobile', () => {
  it('returns true for small screens', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false for tablet/desktop', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});

describe('useIsPortrait', () => {
  it('returns a boolean', () => {
    const { result } = renderHook(() => useIsPortrait());
    expect(typeof result.current).toBe('boolean');
  });
});
