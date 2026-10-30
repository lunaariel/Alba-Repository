import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { entornoPublico, entornoServidor } from '@/config/entorno';

/** Cliente con la sesión de la persona: todo lo que lee y escribe pasa por RLS. */
export async function clienteSesion() {
  const almacen = await cookies();
  return createServerClient(entornoPublico.NEXT_PUBLIC_SUPABASE_URL, entornoPublico.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          // En componentes de servidor no se pueden escribir cookies; el middleware renueva la sesión.
        }
      },
    },
  });
}

/**
 * Cliente anónimo sin cookies, para páginas públicas que se pueden guardar en caché.
 * Ve exactamente lo que RLS permite a un visitante: contenido publicado.
 */
export function clientePublico() {
  return createClient(entornoPublico.NEXT_PUBLIC_SUPABASE_URL, entornoPublico.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente con la clave de servicio: salta RLS. Solo para operaciones del servidor ya autorizadas
 * (webhooks, funciones de crear_orden, emitir_certificado, etc.). Nunca llega al navegador.
 */
export function clienteServicio() {
  const e = entornoServidor();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
