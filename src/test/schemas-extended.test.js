// ── Tests de schemas extendidos ───────────────────────────────────────────
// Delivery, facturación, stock, reservas, menú, layout.

import { describe, it, expect } from 'vitest';
import { deliveryOrderSchema } from '@/lib/schemas/delivery';
import { facturaASchema, facturaBSchema } from '@/lib/schemas/factura';
import { stockAdjustSchema, stockIngresoSchema, nuevoIngredienteSchema } from '@/lib/schemas/stock';
import { reservationSchema } from '@/lib/schemas/reserva';
import { menuItemSchema } from '@/lib/schemas/menu';
import { tableLayoutSchema } from '@/lib/schemas/layout';

// ── deliveryOrderSchema ──────────────────────────────────────────────────
describe('deliveryOrderSchema', () => {
  const validItem = { menuItemId: 'menu-1', nombre: 'Pizza', precio: 2000, cantidad: 1 };
  const valid = {
    clienteNombre: 'Juan Pérez',
    clientePhone: '+54 11 1234-5678',
    direccion: 'Av. Corrientes 1234, CABA',
    plataforma: 'local',
    items: [validItem],
    notas: '',
  };

  it('acepta pedido válido', () => {
    expect(deliveryOrderSchema.safeParse(valid).success).toBe(true);
  });
  it('rechaza sin items', () => {
    expect(deliveryOrderSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });
  it('rechaza nombre vacío', () => {
    expect(deliveryOrderSchema.safeParse({ ...valid, clienteNombre: 'A' }).success).toBe(false);
  });
  it('rechaza dirección muy corta', () => {
    expect(deliveryOrderSchema.safeParse({ ...valid, direccion: 'abc' }).success).toBe(false);
  });
  it('rechaza teléfono inválido', () => {
    expect(deliveryOrderSchema.safeParse({ ...valid, clientePhone: '123' }).success).toBe(false);
  });
  it('acepta plataformas válidas', () => {
    for (const p of ['local', 'rappi', 'pedidosya', 'otra']) {
      expect(deliveryOrderSchema.safeParse({ ...valid, plataforma: p }).success).toBe(true);
    }
  });
  it('rechaza plataforma inválida', () => {
    expect(deliveryOrderSchema.safeParse({ ...valid, plataforma: 'uber' }).success).toBe(false);
  });
  it('rechaza item con cantidad 0', () => {
    expect(deliveryOrderSchema.safeParse({ ...valid, items: [{ ...validItem, cantidad: 0 }] }).success).toBe(false);
  });
  it('rechaza item con precio negativo', () => {
    expect(deliveryOrderSchema.safeParse({ ...valid, items: [{ ...validItem, precio: -100 }] }).success).toBe(false);
  });
});

// ── facturaASchema ───────────────────────────────────────────────────────
describe('facturaASchema', () => {
  const valid = {
    cuit: '20-12345678-9',
    razonSocial: 'Empresa SRL',
    email: 'empresa@email.com',
    domicilio: 'Av. Libertador 1000',
  };

  it('acepta factura A válida', () => {
    const r = facturaASchema.safeParse(valid);
    expect(r.success).toBe(true);
  });
  it('normaliza CUIT quitando guiones', () => {
    const r = facturaASchema.parse(valid);
    expect(r.cuit).toBe('20123456789');
  });
  it('rechaza CUIT inválido', () => {
    expect(facturaASchema.safeParse({ ...valid, cuit: 'abc' }).success).toBe(false);
  });
  it('rechaza razón social muy corta', () => {
    expect(facturaASchema.safeParse({ ...valid, razonSocial: 'A' }).success).toBe(false);
  });
  it('rechaza email inválido', () => {
    expect(facturaASchema.safeParse({ ...valid, email: 'nomail' }).success).toBe(false);
  });
  it('acepta sin domicilio (usa default vacío)', () => {
    const { domicilio, ...sinDomicilio } = valid;
    expect(facturaASchema.safeParse(sinDomicilio).success).toBe(true);
  });
  it('acepta domicilio vacío', () => {
    expect(facturaASchema.safeParse({ ...valid, domicilio: '' }).success).toBe(true);
  });
});

// ── facturaBSchema ───────────────────────────────────────────────────────
describe('facturaBSchema', () => {
  it('acepta email vacío', () => {
    expect(facturaBSchema.safeParse({ email: '' }).success).toBe(true);
  });
  it('acepta email válido', () => {
    expect(facturaBSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });
  it('rechaza email inválido', () => {
    expect(facturaBSchema.safeParse({ email: 'nomail' }).success).toBe(false);
  });
});

// ── stockAdjustSchema ────────────────────────────────────────────────────
describe('stockAdjustSchema', () => {
  it('acepta ajuste válido', () => {
    expect(stockAdjustSchema.safeParse({
      ingredienteId: 'ing-1', cantidad: 5, motivo: 'Merma cocina', unidad: 'kg',
    }).success).toBe(true);
  });
  it('rechaza cantidad 0', () => {
    expect(stockAdjustSchema.safeParse({
      ingredienteId: 'ing-1', cantidad: 0, motivo: 'Merma', unidad: 'kg',
    }).success).toBe(false);
  });
  it('rechaza motivo corto', () => {
    expect(stockAdjustSchema.safeParse({
      ingredienteId: 'ing-1', cantidad: 5, motivo: 'abc', unidad: 'kg',
    }).success).toBe(false);
  });
  it('rechaza ingredienteId vacío', () => {
    expect(stockAdjustSchema.safeParse({
      ingredienteId: '', cantidad: 5, motivo: 'Merma cocina', unidad: 'kg',
    }).success).toBe(false);
  });
});

// ── stockIngresoSchema ───────────────────────────────────────────────────
describe('stockIngresoSchema', () => {
  it('acepta ingreso válido', () => {
    expect(stockIngresoSchema.safeParse({
      ingredienteId: 'ing-1', cantidad: 10, costoUnitario: 500, proveedor: 'Proveedor X',
    }).success).toBe(true);
  });
  it('acepta sin proveedor', () => {
    expect(stockIngresoSchema.safeParse({
      ingredienteId: 'ing-1', cantidad: 10,
    }).success).toBe(true);
  });
  it('rechaza cantidad negativa', () => {
    expect(stockIngresoSchema.safeParse({
      ingredienteId: 'ing-1', cantidad: -5,
    }).success).toBe(false);
  });
});

// ── nuevoIngredienteSchema ───────────────────────────────────────────────
describe('nuevoIngredienteSchema', () => {
  it('acepta ingrediente válido', () => {
    expect(nuevoIngredienteSchema.safeParse({
      nombre: 'Tomate', unidad: 'kg', stockMinimo: 5, costo: 1200,
    }).success).toBe(true);
  });
  it('acepta todas las unidades', () => {
    for (const u of ['kg', 'g', 'lt', 'ml', 'un']) {
      expect(nuevoIngredienteSchema.safeParse({
        nombre: 'Item', unidad: u,
      }).success).toBe(true);
    }
  });
  it('rechaza unidad inválida', () => {
    expect(nuevoIngredienteSchema.safeParse({
      nombre: 'Item', unidad: 'lbs',
    }).success).toBe(false);
  });
  it('rechaza nombre muy corto', () => {
    expect(nuevoIngredienteSchema.safeParse({
      nombre: 'A', unidad: 'kg',
    }).success).toBe(false);
  });
});

// ── reservationSchema ────────────────────────────────────────────────────
describe('reservationSchema', () => {
  const valid = {
    nombre: 'María García',
    telefono: '1134567890',
    email: '',
    fecha: '2026-06-15',
    hora: '20:30',
    personas: 4,
    notas: '',
    canal: 'telefono',
  };

  it('acepta reserva válida', () => {
    expect(reservationSchema.safeParse(valid).success).toBe(true);
  });
  it('acepta con email', () => {
    expect(reservationSchema.safeParse({ ...valid, email: 'a@b.com' }).success).toBe(true);
  });
  it('rechaza sin nombre', () => {
    expect(reservationSchema.safeParse({ ...valid, nombre: 'A' }).success).toBe(false);
  });
  it('rechaza sin fecha', () => {
    expect(reservationSchema.safeParse({ ...valid, fecha: '' }).success).toBe(false);
  });
  it('rechaza hora inválida', () => {
    expect(reservationSchema.safeParse({ ...valid, hora: '8pm' }).success).toBe(false);
  });
  it('rechaza 0 personas', () => {
    expect(reservationSchema.safeParse({ ...valid, personas: 0 }).success).toBe(false);
  });
  it('rechaza más de 50 personas', () => {
    expect(reservationSchema.safeParse({ ...valid, personas: 51 }).success).toBe(false);
  });
  it('acepta todos los canales', () => {
    for (const c of ['telefono', 'whatsapp', 'web', 'presencial', 'otro']) {
      expect(reservationSchema.safeParse({ ...valid, canal: c }).success).toBe(true);
    }
  });
});

// ── menuItemSchema ───────────────────────────────────────────────────────
describe('menuItemSchema', () => {
  it('acepta plato válido', () => {
    expect(menuItemSchema.safeParse({
      nombre: 'Milanesa napolitana', precio: 8500, categoria: 'Platos principales',
    }).success).toBe(true);
  });
  it('acepta precio 0 (cortesía)', () => {
    expect(menuItemSchema.safeParse({
      nombre: 'Pan de cortesía', precio: 0, categoria: 'Extras',
    }).success).toBe(true);
  });
  it('rechaza precio negativo', () => {
    expect(menuItemSchema.safeParse({
      nombre: 'Item', precio: -100, categoria: 'X',
    }).success).toBe(false);
  });
  it('rechaza sin categoría', () => {
    expect(menuItemSchema.safeParse({
      nombre: 'Item', precio: 100, categoria: '',
    }).success).toBe(false);
  });
  it('rechaza nombre muy corto', () => {
    expect(menuItemSchema.safeParse({
      nombre: 'A', precio: 100, categoria: 'X',
    }).success).toBe(false);
  });
});

// ── tableLayoutSchema ────────────────────────────────────────────────────
describe('tableLayoutSchema', () => {
  it('acepta mesa válida', () => {
    expect(tableLayoutSchema.safeParse({ mesaNum: 1, sillas: 4 }).success).toBe(true);
  });
  it('acepta mesa 999 con 30 sillas', () => {
    expect(tableLayoutSchema.safeParse({ mesaNum: 999, sillas: 30 }).success).toBe(true);
  });
  it('rechaza mesa 0', () => {
    expect(tableLayoutSchema.safeParse({ mesaNum: 0, sillas: 4 }).success).toBe(false);
  });
  it('rechaza mesa 1000', () => {
    expect(tableLayoutSchema.safeParse({ mesaNum: 1000, sillas: 4 }).success).toBe(false);
  });
  it('rechaza 0 sillas', () => {
    expect(tableLayoutSchema.safeParse({ mesaNum: 1, sillas: 0 }).success).toBe(false);
  });
  it('rechaza 31 sillas', () => {
    expect(tableLayoutSchema.safeParse({ mesaNum: 1, sillas: 31 }).success).toBe(false);
  });
  it('rechaza mesa decimal', () => {
    expect(tableLayoutSchema.safeParse({ mesaNum: 1.5, sillas: 4 }).success).toBe(false);
  });
});
