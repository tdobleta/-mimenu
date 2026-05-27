import { z } from 'zod';
import { textSchema, phoneArgSchema, emailOptionalSchema } from '@/lib/validation';

/** Nueva reserva */
export const reservationSchema = z.object({
  nombre: textSchema(2, 100, 'Nombre'),
  telefono: phoneArgSchema,
  email: emailOptionalSchema.default(''),
  fecha: z.string().min(1, 'Seleccioná una fecha'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida (HH:MM)'),
  personas: z.number().int().min(1, 'Mínimo 1 persona').max(50, 'Máximo 50 personas'),
  mesa: z.number().int().min(0).optional(),
  notas: z.string().max(500).default(''),
  canal: z.enum(['telefono', 'whatsapp', 'web', 'presencial', 'otro']).default('telefono'),
});
