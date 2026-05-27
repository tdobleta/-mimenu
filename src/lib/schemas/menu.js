import { z } from 'zod';
import { moneySchema, textSchema } from '@/lib/validation';

/** Plato / item del menú */
export const menuItemSchema = z.object({
  nombre: textSchema(2, 100, 'Nombre del plato'),
  precio: moneySchema,
  categoria: z.string().min(1, 'Seleccioná una categoría'),
  descripcion: z.string().max(500).default(''),
  activo: z.boolean().default(true),
});
