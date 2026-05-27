// ── Tests de clasificación de errores ─────────────────────────────────────
// Verifica que los errores se clasifican correctamente para mostrar al usuario.

import { describe, it, expect, vi } from 'vitest';
import { classifyError, getUserErrorMessage, ERR } from '@/lib/errorMessages';

describe('classifyError', () => {
  it('detecta error de red cuando no hay internet', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(classifyError(new Error('fetch failed'))).toBe('network');
    vi.unstubAllGlobals();
  });

  it('detecta error de permisos por código Postgres 42501', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError({ code: '42501', message: 'permission denied' })).toBe('permission');
    vi.unstubAllGlobals();
  });

  it('detecta error de permisos por mensaje', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError({ message: 'No tenés permiso para esto' })).toBe('permission');
    vi.unstubAllGlobals();
  });

  it('detecta not found por código Postgres P0002', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError({ code: 'P0002', message: 'not found' })).toBe('notFound');
    vi.unstubAllGlobals();
  });

  it('detecta conflicto por código 23505 (unique violation)', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError({ code: '23505', message: 'duplicate key' })).toBe('conflict');
    vi.unstubAllGlobals();
  });

  it('detecta timeout por mensaje', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError({ message: 'request timeout' })).toBe('timeout');
    vi.unstubAllGlobals();
  });

  it('detecta error de servidor por status 500+', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError({ status: 500, message: 'Internal server error' })).toBe('server');
    expect(classifyError({ status: 503, message: 'Service unavailable' })).toBe('server');
    vi.unstubAllGlobals();
  });

  it('devuelve unknown para error genérico', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError(new Error('algo raro pasó'))).toBe('unknown');
    vi.unstubAllGlobals();
  });

  it('devuelve unknown para null/undefined', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
    vi.unstubAllGlobals();
  });
});

describe('getUserErrorMessage', () => {
  it('devuelve mensaje en español para cada categoría', () => {
    vi.stubGlobal('navigator', { onLine: true });
    // Todos los mensajes ERR deben ser strings no vacíos
    for (const [key, msg] of Object.entries(ERR)) {
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(5);
    }
    vi.unstubAllGlobals();
  });

  it('devuelve un string para un error genérico', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const msg = getUserErrorMessage(new Error('test'));
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
