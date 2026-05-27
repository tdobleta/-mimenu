import { z } from 'zod';
import { moneySchema, moneyPositiveSchema, textSchema } from '@/lib/validation';

/** Retiro de caja */
export const retiroSchema = z.object({
  monto: moneyPositiveSchema,
  motivo: textSchema(4, 200, 'Motivo'),
});

/** Apertura de turno de caja */
export const openShiftSchema = z.object({
  fondoInicial: moneySchema,
  tipoTurno: z.enum(['manana', 'tarde', 'noche', 'general'], {
    errorMap: () => ({ message: 'Seleccioná un tipo de turno' }),
  }),
});

/** Cierre de turno de caja */
export const closeShiftSchema = z.object({
  arqueoEfectivo: moneySchema,
  motivoDiferencia: z.string().trim().max(500).default(''),
});
