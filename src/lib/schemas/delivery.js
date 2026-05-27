import { z } from 'zod';
import { textSchema, phoneArgSchema } from '@/lib/validation';

/** Item dentro de un pedido delivery */
const deliveryItemSchema = z.object({
  menuItemId: z.string().min(1),
  nombre: z.string().min(1),
  precio: z.number().min(0),
  cantidad: z.number().int().min(1).max(99),
});

/** Pedido delivery nuevo */
export const deliveryOrderSchema = z.object({
  clienteNombre: textSchema(2, 100, 'Nombre'),
  clientePhone: phoneArgSchema,
  direccion: textSchema(5, 300, 'Dirección'),
  plataforma: z.enum(['local', 'rappi', 'pedidosya', 'otra']).default('local'),
  items: z.array(deliveryItemSchema).min(1, 'Agregá al menos un producto'),
  notas: z.string().max(500).default(''),
});
