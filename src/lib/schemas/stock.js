import { z } from 'zod';
import { textSchema } from '@/lib/validation';

/** Ajuste de stock (egreso manual, merma, etc.) */
export const stockAdjustSchema = z.object({
  ingredienteId: z.string().min(1, 'Seleccioná un ingrediente'),
  cantidad: z.number().min(0.01, 'La cantidad debe ser mayor a cero').max(99999, 'Cantidad demasiado alta'),
  motivo: textSchema(4, 200, 'Motivo'),
  unidad: z.string().default(''),
});

/** Ingreso / compra de stock */
export const stockIngresoSchema = z.object({
  ingredienteId: z.string().min(1, 'Seleccioná un ingrediente'),
  cantidad: z.number().min(0.01, 'La cantidad debe ser mayor a cero').max(99999, 'Cantidad demasiado alta'),
  costoUnitario: z.number().min(0).max(99_999_999).default(0),
  proveedor: z.string().max(200).default(''),
});

/** Nuevo ingrediente */
export const nuevoIngredienteSchema = z.object({
  nombre: textSchema(2, 100, 'Nombre'),
  unidad: z.enum(['kg', 'g', 'lt', 'ml', 'un'], {
    errorMap: () => ({ message: 'Seleccioná una unidad' }),
  }),
  stockMinimo: z.number().min(0).max(99999).default(0),
  costo: z.number().min(0).max(99_999_999).default(0),
});
