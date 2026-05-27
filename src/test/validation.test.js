// ── Tests de primitivas de validación ──────────────────────────────────────
// Estas primitivas protegen TODOS los formularios de dinero.
// Si un test falla acá, hay un bug que afecta cobros, retiros, facturación, etc.

import { describe, it, expect } from 'vitest';
import {
  moneySchema,
  moneyPositiveSchema,
  quantitySchema,
  phoneArgSchema,
  emailSchema,
  emailOptionalSchema,
  cuitSchema,
  textSchema,
  parseAmount,
  safeParseAmount,
} from '@/lib/validation';

// ── moneySchema ──────────────────────────────────────────────────────────
describe('moneySchema', () => {
  it('acepta 0', () => {
    expect(moneySchema.parse(0)).toBe(0);
  });
  it('acepta 0.01', () => {
    expect(moneySchema.parse(0.01)).toBe(0.01);
  });
  it('acepta 99999999 (tope)', () => {
    expect(moneySchema.parse(99_999_999)).toBe(99_999_999);
  });
  it('redondea a 2 decimales', () => {
    expect(moneySchema.parse(10.999)).toBe(11);
    expect(moneySchema.parse(5.555)).toBe(5.56);
    expect(moneySchema.parse(1.001)).toBe(1);
  });
  it('rechaza negativo', () => {
    expect(moneySchema.safeParse(-1).success).toBe(false);
    expect(moneySchema.safeParse(-0.01).success).toBe(false);
  });
  it('rechaza mayor al tope', () => {
    expect(moneySchema.safeParse(100_000_000).success).toBe(false);
  });
  it('rechaza NaN', () => {
    expect(moneySchema.safeParse(NaN).success).toBe(false);
  });
  it('rechaza string', () => {
    expect(moneySchema.safeParse('abc').success).toBe(false);
  });
  it('rechaza Infinity', () => {
    expect(moneySchema.safeParse(Infinity).success).toBe(false);
  });
  it('rechaza null/undefined', () => {
    expect(moneySchema.safeParse(null).success).toBe(false);
    expect(moneySchema.safeParse(undefined).success).toBe(false);
  });
});

// ── moneyPositiveSchema ──────────────────────────────────────────────────
describe('moneyPositiveSchema', () => {
  it('acepta 0.01', () => {
    expect(moneyPositiveSchema.parse(0.01)).toBe(0.01);
  });
  it('rechaza 0', () => {
    expect(moneyPositiveSchema.safeParse(0).success).toBe(false);
  });
  it('rechaza negativo', () => {
    expect(moneyPositiveSchema.safeParse(-5).success).toBe(false);
  });
});

// ── quantitySchema ───────────────────────────────────────────────────────
describe('quantitySchema', () => {
  it('acepta 1', () => {
    expect(quantitySchema.parse(1)).toBe(1);
  });
  it('acepta 9999 (tope)', () => {
    expect(quantitySchema.parse(9999)).toBe(9999);
  });
  it('rechaza 0', () => {
    expect(quantitySchema.safeParse(0).success).toBe(false);
  });
  it('rechaza negativos', () => {
    expect(quantitySchema.safeParse(-1).success).toBe(false);
  });
  it('rechaza decimales', () => {
    expect(quantitySchema.safeParse(1.5).success).toBe(false);
  });
  it('rechaza mayor al tope', () => {
    expect(quantitySchema.safeParse(10000).success).toBe(false);
  });
});

// ── phoneArgSchema ───────────────────────────────────────────────────────
describe('phoneArgSchema', () => {
  it('acepta +54 11 1234-5678', () => {
    expect(phoneArgSchema.parse('+54 11 1234-5678')).toBeTruthy();
  });
  it('acepta (011) 4444-5555', () => {
    expect(phoneArgSchema.parse('(011) 4444-5555')).toBeTruthy();
  });
  it('acepta 1134567890', () => {
    expect(phoneArgSchema.parse('1134567890')).toBeTruthy();
  });
  it('rechaza abc', () => {
    expect(phoneArgSchema.safeParse('abc').success).toBe(false);
  });
  it('rechaza string muy corta', () => {
    expect(phoneArgSchema.safeParse('123').success).toBe(false);
  });
  it('rechaza vacío', () => {
    expect(phoneArgSchema.safeParse('').success).toBe(false);
  });
});

// ── emailSchema ──────────────────────────────────────────────────────────
describe('emailSchema', () => {
  it('acepta email válido', () => {
    expect(emailSchema.parse('user@example.com')).toBe('user@example.com');
  });
  it('trimmea espacios', () => {
    expect(emailSchema.parse('  user@example.com  ')).toBe('user@example.com');
  });
  it('rechaza email sin @', () => {
    expect(emailSchema.safeParse('userexample.com').success).toBe(false);
  });
  it('rechaza email sin dominio', () => {
    expect(emailSchema.safeParse('user@').success).toBe(false);
  });
  it('rechaza vacío', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

// ── emailOptionalSchema ──────────────────────────────────────────────────
describe('emailOptionalSchema', () => {
  it('acepta string vacío', () => {
    expect(emailOptionalSchema.safeParse('').success).toBe(true);
  });
  it('acepta email válido', () => {
    expect(emailOptionalSchema.safeParse('a@b.com').success).toBe(true);
  });
  it('rechaza email inválido', () => {
    expect(emailOptionalSchema.safeParse('a@').success).toBe(false);
  });
});

// ── cuitSchema ───────────────────────────────────────────────────────────
describe('cuitSchema', () => {
  it('acepta 20-12345678-9 (con guiones)', () => {
    expect(cuitSchema.parse('20-12345678-9')).toBe('20123456789');
  });
  it('acepta 20123456789 (sin guiones)', () => {
    expect(cuitSchema.parse('20123456789')).toBe('20123456789');
  });
  it('rechaza CUIT corto', () => {
    expect(cuitSchema.safeParse('201234567').success).toBe(false);
  });
  it('rechaza CUIT con letras', () => {
    expect(cuitSchema.safeParse('2A-12345678-9').success).toBe(false);
  });
  it('rechaza vacío', () => {
    expect(cuitSchema.safeParse('').success).toBe(false);
  });
});

// ── textSchema ───────────────────────────────────────────────────────────
describe('textSchema', () => {
  const schema = textSchema(4, 200, 'Motivo');
  it('acepta texto válido', () => {
    expect(schema.parse('Pago proveedor')).toBe('Pago proveedor');
  });
  it('trimmea espacios', () => {
    expect(schema.parse('  hola  ')).toBe('hola');
  });
  it('rechaza texto muy corto', () => {
    expect(schema.safeParse('abc').success).toBe(false);
  });
  it('rechaza texto muy largo', () => {
    expect(schema.safeParse('a'.repeat(201)).success).toBe(false);
  });
  it('rechaza vacío', () => {
    expect(schema.safeParse('').success).toBe(false);
  });
});

// ── parseAmount ──────────────────────────────────────────────────────────
describe('parseAmount', () => {
  it('parsea entero', () => {
    expect(parseAmount(1500)).toBe(1500);
  });
  it('parsea decimal', () => {
    expect(parseAmount(15.5)).toBe(15.5);
  });
  it('parsea string "1500.50" — en formato AR el punto es miles, así que 1500.50 = 150050', () => {
    // parseAmount siempre trata el punto como separador de miles (formato AR)
    // Para decimales usar coma: "1500,50" = 1500.50
    expect(parseAmount('1500.50')).toBe(150050);
  });
  it('parsea string con coma decimal "1500,50"', () => {
    expect(parseAmount('1500,50')).toBe(1500.50);
  });
  it('parsea formato argentino "1.500,50"', () => {
    expect(parseAmount('1.500,50')).toBe(1500.50);
  });
  it('parsea "10.000"', () => {
    // Formato argentino: 10.000 = diez mil
    expect(parseAmount('10.000')).toBe(10000);
  });
  it('redondea a 2 decimales', () => {
    expect(parseAmount(10.999)).toBe(11);
  });
  it('lanza error con negativo', () => {
    expect(() => parseAmount(-5)).toThrow('negativo');
  });
  it('lanza error con NaN', () => {
    expect(() => parseAmount('abc')).toThrow('inválido');
  });
  it('lanza error con vacío', () => {
    expect(() => parseAmount('')).toThrow('requerido');
  });
  it('lanza error con null', () => {
    expect(() => parseAmount(null)).toThrow('requerido');
  });
  it('lanza error con Infinity', () => {
    expect(() => parseAmount(Infinity)).toThrow();
  });
  it('lanza error si excede tope', () => {
    expect(() => parseAmount(100_000_000)).toThrow('alto');
  });
});

// ── safeParseAmount ──────────────────────────────────────────────────────
describe('safeParseAmount', () => {
  it('devuelve ok: true con valor válido', () => {
    const r = safeParseAmount(1500);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(1500);
    expect(r.error).toBeNull();
  });
  it('devuelve ok: false con valor inválido', () => {
    const r = safeParseAmount('abc');
    expect(r.ok).toBe(false);
    expect(r.value).toBe(0);
    expect(r.error).toBeTruthy();
  });
});
