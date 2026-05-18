// src/test/calculos.test.js
// Tests unitarios para lógica crítica del POS.
// Target: 100% cobertura en cálculos de totales, propinas y pagos.

import { describe, it, expect } from 'vitest';

// ── Lógica extraída de POSView.jsx ────────────────────────────
// Estas funciones replican exactamente los cálculos del POS

function calcularTotal(order) {
  return order.reduce((s, i) => s + (i.precio + (i.extra || 0)) * i.qty, 0);
}

function calcularPropina(total, propinaPct, propinaCustom) {
  if (propinaCustom && Number(propinaCustom) > 0) {
    return Number(propinaCustom);
  }
  return Math.round(total * propinaPct / 100);
}

function calcularTotalFinal(total, propinaAmt) {
  return total + propinaAmt;
}

function calcularRestante(totalFinal, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  return Math.max(0, totalFinal - totalPagado);
}

function calcularVuelto(totalFinal, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  return Math.max(0, totalPagado - totalFinal);
}

function calcularFoodCost(precioVenta, costoIngredientes) {
  if (!precioVenta || precioVenta === 0) return 0;
  return (costoIngredientes / precioVenta) * 100;
}

function calcularPrecioSinIva(precioConIva, alicuota = 21) {
  return precioConIva / (1 + alicuota / 100);
}

// ── TESTS ─────────────────────────────────────────────────────

describe('calcularTotal', () => {
  it('calcula total de una orden simple', () => {
    const order = [{ precio: 1000, extra: 0, qty: 2 }];
    expect(calcularTotal(order)).toBe(2000);
  });

  it('incluye extras en el total', () => {
    const order = [{ precio: 1000, extra: 200, qty: 1 }];
    expect(calcularTotal(order)).toBe(1200);
  });

  it('suma múltiples ítems', () => {
    const order = [
      { precio: 500, extra: 0, qty: 3 },
      { precio: 1000, extra: 100, qty: 2 },
    ];
    expect(calcularTotal(order)).toBe(500 * 3 + 1100 * 2);
  });

  it('orden vacía devuelve 0', () => {
    expect(calcularTotal([])).toBe(0);
  });

  it('maneja extra undefined', () => {
    const order = [{ precio: 500, qty: 2 }];
    expect(calcularTotal(order)).toBe(1000);
  });

  it('maneja qty 0', () => {
    const order = [{ precio: 500, extra: 0, qty: 0 }];
    expect(calcularTotal(order)).toBe(0);
  });
});

describe('calcularPropina', () => {
  it('calcula propina por porcentaje', () => {
    expect(calcularPropina(1000, 10, '')).toBe(100);
  });

  it('calcula propina 15%', () => {
    expect(calcularPropina(1000, 15, '')).toBe(150);
  });

  it('propina custom sobreescribe porcentaje', () => {
    expect(calcularPropina(1000, 10, '500')).toBe(500);
  });

  it('propina 0% devuelve 0', () => {
    expect(calcularPropina(1000, 0, '')).toBe(0);
  });

  it('redondea correctamente', () => {
    // 10% de 333 = 33.3 → redondeado a 33
    expect(calcularPropina(333, 10, '')).toBe(33);
  });

  it('propina custom 0 usa porcentaje', () => {
    expect(calcularPropina(1000, 10, '0')).toBe(100);
  });
});

describe('calcularTotalFinal', () => {
  it('suma total y propina', () => {
    expect(calcularTotalFinal(1000, 100)).toBe(1100);
  });

  it('sin propina devuelve el total', () => {
    expect(calcularTotalFinal(1000, 0)).toBe(1000);
  });
});

describe('calcularRestante', () => {
  it('sin pagos devuelve el total', () => {
    expect(calcularRestante(1000, [])).toBe(1000);
  });

  it('pago parcial devuelve diferencia', () => {
    expect(calcularRestante(1000, [{ monto: '400' }])).toBe(600);
  });

  it('pago exacto devuelve 0', () => {
    expect(calcularRestante(1000, [{ monto: '1000' }])).toBe(0);
  });

  it('sobrepago devuelve 0 (no negativo)', () => {
    expect(calcularRestante(1000, [{ monto: '1500' }])).toBe(0);
  });

  it('múltiples pagos se suman', () => {
    expect(calcularRestante(1000, [{ monto: '400' }, { monto: '300' }])).toBe(300);
  });

  it('maneja montos inválidos como 0', () => {
    expect(calcularRestante(1000, [{ monto: 'abc' }])).toBe(1000);
  });
});

describe('calcularVuelto', () => {
  it('pago exacto no genera vuelto', () => {
    expect(calcularVuelto(1000, [{ monto: '1000' }])).toBe(0);
  });

  it('sobrepago genera vuelto correcto', () => {
    expect(calcularVuelto(1000, [{ monto: '1500' }])).toBe(500);
  });

  it('pago insuficiente devuelve 0', () => {
    expect(calcularVuelto(1000, [{ monto: '500' }])).toBe(0);
  });
});

describe('calcularFoodCost', () => {
  it('calcula porcentaje correcto', () => {
    expect(calcularFoodCost(1000, 300)).toBe(30);
  });

  it('0% cuando no hay costo', () => {
    expect(calcularFoodCost(1000, 0)).toBe(0);
  });

  it('precio 0 devuelve 0 sin dividir por cero', () => {
    expect(calcularFoodCost(0, 300)).toBe(0);
  });

  it('food cost saludable es menor a 35%', () => {
    const fc = calcularFoodCost(1000, 250);
    expect(fc).toBeLessThan(35);
  });

  it('food cost insalubre es mayor a 35%', () => {
    const fc = calcularFoodCost(1000, 400);
    expect(fc).toBeGreaterThan(35);
  });
});

describe('calcularPrecioSinIva', () => {
  it('calcula precio sin IVA 21%', () => {
    const sinIva = calcularPrecioSinIva(1210);
    expect(sinIva).toBeCloseTo(1000, 1);
  });

  it('calcula precio sin IVA 10.5%', () => {
    const sinIva = calcularPrecioSinIva(1105, 10.5);
    expect(sinIva).toBeCloseTo(1000, 1);
  });

  it('usa 21% por defecto', () => {
    const sinIva = calcularPrecioSinIva(121);
    expect(sinIva).toBeCloseTo(100, 1);
  });
});
