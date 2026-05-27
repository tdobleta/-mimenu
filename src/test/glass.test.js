// ── Test: glass.js responsive utilities ───────────────────────────────────
import { describe, it, expect } from 'vitest';
import { BP, MQ, modalWidth, containerPad } from '@/lib/glass';

describe('BP breakpoints', () => {
  it('has all 4 breakpoints', () => {
    expect(BP.sm).toBe(640);
    expect(BP.md).toBe(768);
    expect(BP.lg).toBe(1024);
    expect(BP.xl).toBe(1280);
  });

  it('breakpoints are ascending', () => {
    expect(BP.sm).toBeLessThan(BP.md);
    expect(BP.md).toBeLessThan(BP.lg);
    expect(BP.lg).toBeLessThan(BP.xl);
  });
});

describe('MQ media queries', () => {
  it('generates correct media query strings', () => {
    expect(MQ.sm).toBe('(min-width: 640px)');
    expect(MQ.md).toBe('(min-width: 768px)');
    expect(MQ.lg).toBe('(min-width: 1024px)');
    expect(MQ.xl).toBe('(min-width: 1280px)');
  });
});

describe('modalWidth', () => {
  it('returns width 100% and maxWidth with min()', () => {
    const style = modalWidth(460);
    expect(style.width).toBe('100%');
    expect(style.maxWidth).toContain('460');
    expect(style.maxWidth).toContain('95vw');
  });

  it('caps at 95vw', () => {
    const style = modalWidth(2000);
    expect(style.maxWidth).toContain('95vw');
  });

  it('works with small values', () => {
    const style = modalWidth(200);
    expect(style.maxWidth).toContain('200');
  });
});

describe('containerPad', () => {
  it('uses clamp for responsive padding', () => {
    expect(containerPad.padding).toContain('clamp');
    expect(containerPad.padding).toContain('12px');
    expect(containerPad.padding).toContain('24px');
  });
});
