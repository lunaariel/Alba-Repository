import { z } from 'zod';

/**
 * Variables de entorno validadas al arrancar. Si falta alguna, la aplicación no inicia
 * y el error dice cuál. Los secretos nunca se exponen al navegador (sin prefijo NEXT_PUBLIC_).
 */
const esquemaPublico = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_URL_SITIO: z.string().url(),
});

const esquemaServidor = esquemaPublico.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  PAGOS_PROVEEDOR: z.enum(['simulado']).default('simulado'),
  PAGOS_SECRETO_SIMULADO: z.string().min(16).optional(),
});

export const entornoPublico = esquemaPublico.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_URL_SITIO: process.env.NEXT_PUBLIC_URL_SITIO,
});

/** Solo debe importarse desde código de servidor. */
export function entornoServidor() {
  return esquemaServidor.parse(process.env);
}
