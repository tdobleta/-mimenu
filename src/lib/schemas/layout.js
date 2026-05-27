import { z } from 'zod';

/** Mesa en el layout del salón */
export const tableLayoutSchema = z.object({
  mesaNum: z.number().int().min(1, 'Mínimo mesa 1').max(999, 'Máximo mesa 999'),
  sillas: z.number().int().min(1, 'Mínimo 1 silla').max(30, 'Máximo 30 sillas'),
});
