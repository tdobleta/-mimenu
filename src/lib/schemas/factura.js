import { z } from 'zod';
import { cuitSchema, emailSchema, textSchema } from '@/lib/validation';

/** Datos del receptor para Factura A */
export const facturaASchema = z.object({
  cuit: cuitSchema,
  razonSocial: textSchema(2, 200, 'Razón social'),
  email: emailSchema,
  domicilio: z.string().trim().max(300, 'Domicilio: Máximo 300 caracteres').default(''),
});

/** Factura B (consumidor final) — solo requiere email opcional */
export const facturaBSchema = z.object({
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().email().safeParse(v).success, {
      message: 'Email inválido',
    })
    .default(''),
});
