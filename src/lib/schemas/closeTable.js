import { z } from 'zod';
import { moneySchema, emailOptionalSchema } from '@/lib/validation';

// Método de pago individual
const paymentMethodEnum = z.enum(
  ['Efectivo', 'Tarjeta', 'MercadoPago', 'Transferencia'],
  { errorMap: () => ({ message: 'Seleccioná un método de pago' }) }
);

// Un pago dentro de modo mixto
export const singlePaymentSchema = z.object({
  metodo: paymentMethodEnum,
  monto: moneySchema.refine((v) => v > 0, 'El monto debe ser mayor a cero'),
});

// Schema principal de cierre de mesa
export const closeTableSchema = z
  .object({
    method: paymentMethodEnum,
    discountEnabled: z.boolean().default(false),
    discountType: z.enum(['%', '$']).default('%'),
    discountValue: moneySchema.default(0),
    discountReason: z.string().trim().default(''),
    tip: moneySchema.default(0),
    clientEmail: emailOptionalSchema.default(''),
    mixMode: z.boolean().default(false),
    amount1: moneySchema.optional(),
    amount2: moneySchema.optional(),
  })
  .refine(
    (data) => {
      // Si hay descuento activo con valor > 0, motivo es obligatorio (min 4 chars)
      if (data.discountEnabled && data.discountValue > 0) {
        return data.discountReason.length >= 4;
      }
      return true;
    },
    {
      message: 'Motivo obligatorio para descuentos (mínimo 4 caracteres)',
      path: ['discountReason'],
    }
  );
