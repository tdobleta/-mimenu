// ── Tests de schemas de negocio ───────────────────────────────────────────
// Cada schema protege un formulario crítico de la app.
// Los edge cases acá representan situaciones reales de un restaurante.

import { describe, it, expect } from 'vitest';
import { closeTableSchema, singlePaymentSchema } from '@/lib/schemas/closeTable';
import { retiroSchema, openShiftSchema, closeShiftSchema } from '@/lib/schemas/caja';

// ── closeTableSchema ─────────────────────────────────────────────────────
describe('closeTableSchema', () => {
  const valid = {
    method: 'Efectivo',
    discountEnabled: false,
    discountType: '%',
    discountValue: 0,
    discountReason: '',
    tip: 0,
    clientEmail: '',
    mixMode: false,
  };

  it('acepta cierre simple válido', () => {
    const r = closeTableSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('acepta cierre con propina', () => {
    const r = closeTableSchema.safeParse({ ...valid, tip: 500 });
    expect(r.success).toBe(true);
  });

  it('acepta cierre con email', () => {
    const r = closeTableSchema.safeParse({ ...valid, clientEmail: 'a@b.com' });
    expect(r.success).toBe(true);
  });

  it('acepta cierre con email vacío', () => {
    const r = closeTableSchema.safeParse({ ...valid, clientEmail: '' });
    expect(r.success).toBe(true);
  });

  it('rechaza método inválido', () => {
    const r = closeTableSchema.safeParse({ ...valid, method: 'Bitcoin' });
    expect(r.success).toBe(false);
  });

  it('rechaza propina negativa', () => {
    const r = closeTableSchema.safeParse({ ...valid, tip: -100 });
    expect(r.success).toBe(false);
  });

  it('rechaza descuento negativo', () => {
    const r = closeTableSchema.safeParse({ ...valid, discountEnabled: true, discountValue: -10 });
    expect(r.success).toBe(false);
  });

  it('acepta descuento con motivo válido', () => {
    const r = closeTableSchema.safeParse({
      ...valid,
      discountEnabled: true,
      discountValue: 500,
      discountReason: 'Cliente habitual',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza descuento activo sin motivo', () => {
    const r = closeTableSchema.safeParse({
      ...valid,
      discountEnabled: true,
      discountValue: 500,
      discountReason: '',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza descuento con motivo muy corto', () => {
    const r = closeTableSchema.safeParse({
      ...valid,
      discountEnabled: true,
      discountValue: 500,
      discountReason: 'abc',
    });
    expect(r.success).toBe(false);
  });

  it('acepta descuento habilitado pero valor 0 sin motivo', () => {
    // Descuento habilitado pero sin valor = no aplica
    const r = closeTableSchema.safeParse({
      ...valid,
      discountEnabled: true,
      discountValue: 0,
      discountReason: '',
    });
    expect(r.success).toBe(true);
  });

  it('acepta todos los métodos de pago', () => {
    for (const m of ['Efectivo', 'Tarjeta', 'MercadoPago', 'Transferencia']) {
      const r = closeTableSchema.safeParse({ ...valid, method: m });
      expect(r.success).toBe(true);
    }
  });
});

// ── singlePaymentSchema ──────────────────────────────────────────────────
describe('singlePaymentSchema', () => {
  it('acepta pago válido', () => {
    const r = singlePaymentSchema.safeParse({ metodo: 'Efectivo', monto: 1500 });
    expect(r.success).toBe(true);
  });
  it('rechaza monto 0', () => {
    const r = singlePaymentSchema.safeParse({ metodo: 'Efectivo', monto: 0 });
    expect(r.success).toBe(false);
  });
  it('rechaza monto negativo', () => {
    const r = singlePaymentSchema.safeParse({ metodo: 'Tarjeta', monto: -100 });
    expect(r.success).toBe(false);
  });
  it('rechaza método inválido', () => {
    const r = singlePaymentSchema.safeParse({ metodo: 'Cripto', monto: 1000 });
    expect(r.success).toBe(false);
  });
});

// ── retiroSchema ─────────────────────────────────────────────────────────
describe('retiroSchema', () => {
  it('acepta retiro válido', () => {
    const r = retiroSchema.safeParse({ monto: 5000, motivo: 'Pago proveedor' });
    expect(r.success).toBe(true);
  });
  it('rechaza monto 0', () => {
    const r = retiroSchema.safeParse({ monto: 0, motivo: 'Pago proveedor' });
    expect(r.success).toBe(false);
  });
  it('rechaza monto negativo', () => {
    const r = retiroSchema.safeParse({ monto: -100, motivo: 'Robo' });
    expect(r.success).toBe(false);
  });
  it('rechaza motivo muy corto', () => {
    const r = retiroSchema.safeParse({ monto: 1000, motivo: 'abc' });
    expect(r.success).toBe(false);
  });
  it('rechaza motivo vacío', () => {
    const r = retiroSchema.safeParse({ monto: 1000, motivo: '' });
    expect(r.success).toBe(false);
  });
  it('rechaza motivo solo espacios', () => {
    const r = retiroSchema.safeParse({ monto: 1000, motivo: '    ' });
    expect(r.success).toBe(false);
  });
});

// ── openShiftSchema ──────────────────────────────────────────────────────
describe('openShiftSchema', () => {
  it('acepta apertura válida', () => {
    const r = openShiftSchema.safeParse({ fondoInicial: 10000, tipoTurno: 'manana' });
    expect(r.success).toBe(true);
  });
  it('acepta fondo 0', () => {
    const r = openShiftSchema.safeParse({ fondoInicial: 0, tipoTurno: 'tarde' });
    expect(r.success).toBe(true);
  });
  it('acepta todos los tipos de turno', () => {
    for (const t of ['manana', 'tarde', 'noche', 'general']) {
      const r = openShiftSchema.safeParse({ fondoInicial: 0, tipoTurno: t });
      expect(r.success).toBe(true);
    }
  });
  it('rechaza fondo negativo', () => {
    const r = openShiftSchema.safeParse({ fondoInicial: -500, tipoTurno: 'manana' });
    expect(r.success).toBe(false);
  });
  it('rechaza tipo de turno inválido', () => {
    const r = openShiftSchema.safeParse({ fondoInicial: 0, tipoTurno: 'madrugada' });
    expect(r.success).toBe(false);
  });
});

// ── closeShiftSchema ─────────────────────────────────────────────────────
describe('closeShiftSchema', () => {
  it('acepta cierre válido', () => {
    const r = closeShiftSchema.safeParse({ arqueoEfectivo: 25000, motivoDiferencia: '' });
    expect(r.success).toBe(true);
  });
  it('acepta cierre con motivo de diferencia', () => {
    const r = closeShiftSchema.safeParse({ arqueoEfectivo: 20000, motivoDiferencia: 'Vuelto faltante' });
    expect(r.success).toBe(true);
  });
  it('acepta arqueo 0', () => {
    const r = closeShiftSchema.safeParse({ arqueoEfectivo: 0, motivoDiferencia: '' });
    expect(r.success).toBe(true);
  });
  it('rechaza arqueo negativo', () => {
    const r = closeShiftSchema.safeParse({ arqueoEfectivo: -1, motivoDiferencia: '' });
    expect(r.success).toBe(false);
  });
});
