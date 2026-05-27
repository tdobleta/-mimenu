// ─── mimenú — Validación centralizada ─────────────────────────────────────────
// Primitivas Zod reutilizables + utilidad parseAmount segura.
// Importar desde cualquier componente: import { moneySchema, parseAmount } from '@/lib/validation'

import { z } from 'zod';

// ── Primitivas ──────────────────────────────────────────────────────────────

/** Monto de dinero: positivo, max 2 decimales, tope razonable */
export const moneySchema = z
  .number({ invalid_type_error: 'Debe ser un número' })
  .min(0, 'El monto no puede ser negativo')
  .max(99_999_999, 'Monto demasiado alto')
  .transform((v) => Math.round(v * 100) / 100);

/** Monto de dinero que debe ser > 0 (retiros, pagos) */
export const moneyPositiveSchema = z
  .number({ invalid_type_error: 'Debe ser un número' })
  .min(0.01, 'El monto debe ser mayor a cero')
  .max(99_999_999, 'Monto demasiado alto')
  .transform((v) => Math.round(v * 100) / 100);

/** Cantidad entera positiva (items, personas, sillas) */
export const quantitySchema = z
  .number({ invalid_type_error: 'Debe ser un número' })
  .int('Debe ser número entero')
  .min(1, 'Mínimo 1')
  .max(9999, 'Máximo 9999');

/** Teléfono argentino flexible (acepta +54, espacios, guiones, paréntesis) */
export const phoneArgSchema = z
  .string()
  .trim()
  .regex(/^[\d\s\-+()]{7,20}$/, 'Teléfono inválido');

/** Email estándar */
export const emailSchema = z.string().trim().email('Email inválido');

/** Email opcional — acepta string vacío o email válido */
export const emailOptionalSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || z.string().email().safeParse(v).success, {
    message: 'Email inválido',
  });

/** CUIT argentino: 11 dígitos, con o sin guiones (XX-XXXXXXXX-X) */
export const cuitSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-?\d{8}-?\d$/, 'CUIT inválido (formato: XX-XXXXXXXX-X)')
  .transform((v) => v.replace(/-/g, ''));

/** Texto con longitud controlada */
export const textSchema = (min, max, label = '') => {
  const prefix = label ? `${label}: ` : '';
  return z
    .string()
    .trim()
    .min(min, `${prefix}Mínimo ${min} caracteres`)
    .max(max, `${prefix}Máximo ${max} caracteres`);
};

// ── Parsing seguro de montos ────────────────────────────────────────────────

/**
 * Parsea un valor de monto de forma segura.
 * Soporta formato argentino ("1.500,50") y estándar ("1500.50").
 * Lanza Error si el valor es inválido, NaN, negativo o Infinity.
 *
 * @param {string|number} val - Valor a parsear
 * @returns {number} Monto redondeado a 2 decimales
 * @throws {Error} Si el valor es inválido
 */
export function parseAmount(val) {
  if (val === '' || val === null || val === undefined) {
    throw new Error('Monto requerido');
  }

  let n;
  if (typeof val === 'number') {
    n = val;
  } else {
    // Formato argentino: "1.500,50" → "1500.50"
    const str = String(val).replace(/\./g, '').replace(',', '.');
    n = parseFloat(str);
  }

  if (isNaN(n) || !isFinite(n)) throw new Error('Monto inválido');
  if (n < 0) throw new Error('El monto no puede ser negativo');
  if (n > 99_999_999) throw new Error('Monto demasiado alto');

  return Math.round(n * 100) / 100;
}

/**
 * Versión safe de parseAmount — devuelve { ok, value, error } en vez de lanzar.
 */
export function safeParseAmount(val) {
  try {
    return { ok: true, value: parseAmount(val), error: null };
  } catch (e) {
    return { ok: false, value: 0, error: e.message };
  }
}
