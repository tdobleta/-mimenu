// ── Test: fmt.js utility functions ───────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  money,
  dateLong,
  dateShort,
  elapsedMin,
  fmtElapsed,
  fmtTableTime,
  tableTotal,
  formatFecha,
  stockStatus,
} from '@/lib/fmt';

describe('money', () => {
  it('formats positive integers', () => {
    const result = money(1500);
    expect(result).toContain('1.500');
    expect(result).toContain('$');
  });

  it('rounds decimals', () => {
    const result = money(1500.7);
    expect(result).toContain('1.501');
  });

  it('returns $0 for null', () => {
    expect(money(null)).toContain('0');
  });

  it('returns $0 for undefined', () => {
    expect(money(undefined)).toContain('0');
  });

  it('returns $0 for NaN', () => {
    expect(money(NaN)).toContain('0');
  });

  it('formats zero', () => {
    expect(money(0)).toContain('0');
  });

  it('formats large numbers with thousand separator', () => {
    const result = money(1500000);
    expect(result).toContain('1.500.000');
  });
});

describe('dateLong', () => {
  it('formats a Date object', () => {
    // Miércoles 15 de enero de 2025
    const d = new Date(2025, 0, 15);
    const result = dateLong(d);
    expect(result).toContain('enero');
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  it('formats an ISO string', () => {
    const result = dateLong('2025-06-20T12:00:00');
    expect(result).toContain('junio');
    expect(result).toContain('2025');
  });

  it('capitalizes the first letter', () => {
    const result = dateLong(new Date(2025, 0, 15));
    expect(result[0]).toBe(result[0].toUpperCase());
  });
});

describe('dateShort', () => {
  it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(dateShort('2025-06-15')).toBe('15/06/2025');
  });

  it('returns empty string for falsy input', () => {
    expect(dateShort('')).toBe('');
    expect(dateShort(null)).toBe('');
    expect(dateShort(undefined)).toBe('');
  });
});

describe('elapsedMin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates minutes from ms timestamp', () => {
    const tenMinAgo = Date.now() - 10 * 60000;
    expect(elapsedMin(tenMinAgo)).toBe(10);
  });

  it('calculates minutes from ISO string', () => {
    expect(elapsedMin('2025-06-15T12:20:00Z')).toBe(10);
  });

  it('returns 0 for future timestamps', () => {
    const future = Date.now() + 60000;
    expect(elapsedMin(future)).toBe(0);
  });
});

describe('fmtElapsed', () => {
  it('returns "ahora mismo" for < 1 min', () => {
    expect(fmtElapsed(0)).toBe('ahora mismo');
  });

  it('returns minutes format', () => {
    expect(fmtElapsed(5)).toBe('hace 5 min');
    expect(fmtElapsed(59)).toBe('hace 59 min');
  });

  it('returns hours format', () => {
    expect(fmtElapsed(60)).toBe('hace 1h');
    expect(fmtElapsed(120)).toBe('hace 2h');
  });

  it('returns hours and minutes', () => {
    expect(fmtElapsed(90)).toBe('hace 1h 30m');
    expect(fmtElapsed(145)).toBe('hace 2h 25m');
  });
});

describe('fmtTableTime', () => {
  it('formats minutes only', () => {
    expect(fmtTableTime(45)).toBe('45m');
  });

  it('formats exact hours', () => {
    expect(fmtTableTime(60)).toBe('1h');
    expect(fmtTableTime(120)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(fmtTableTime(90)).toBe('1h 30m');
    expect(fmtTableTime(75)).toBe('1h 15m');
  });
});

describe('tableTotal', () => {
  it('sums order items', () => {
    const order = [
      { precio: 100, qty: 2 },
      { precio: 50, qty: 3 },
    ];
    expect(tableTotal(order)).toBe(350);
  });

  it('returns 0 for empty array', () => {
    expect(tableTotal([])).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(tableTotal(null)).toBe(0);
    expect(tableTotal(undefined)).toBe(0);
  });

  it('handles single item', () => {
    expect(tableTotal([{ precio: 200, qty: 1 }])).toBe(200);
  });
});

describe('formatFecha', () => {
  it('formats timestamp to DD/MM/YYYY', () => {
    const result = formatFecha('2025-06-15T14:30:00');
    expect(result).toBe('15/06/2025');
  });

  it('formats ms timestamp', () => {
    const d = new Date(2025, 5, 15); // June 15 2025
    const result = formatFecha(d.getTime());
    expect(result).toBe('15/06/2025');
  });
});

describe('stockStatus', () => {
  it('returns "sin stock" when actual is 0', () => {
    expect(stockStatus({ actual: 0, minimo: 10 })).toBe('sin stock');
  });

  it('returns "bajo" when actual < minimo', () => {
    expect(stockStatus({ actual: 3, minimo: 10 })).toBe('bajo');
  });

  it('returns "ok" when actual >= minimo', () => {
    expect(stockStatus({ actual: 10, minimo: 10 })).toBe('ok');
    expect(stockStatus({ actual: 50, minimo: 10 })).toBe('ok');
  });
});
