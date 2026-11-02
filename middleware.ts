import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { construirCsp, modoCsp, nuevoNonce } from './src/config/csp';

/**
 * Renueva la sesión en cada solicitud y lleva a ingresar a quien abre /campus sin sesión.
 * /admin no redirige: su layout responde "no encontrado" a quien no es admin (exigirAdmin),
 * para no revelar que existe. El rol se comprueba en el servidor de cada página y acción.
 */
export async function middleware(request: NextRequest) {
  // CSP con nonce por solicitud: Next lee el nonce del encabezado de la solicitud y lo pone en sus scripts.
  const nonce = nuevoNonce();
  const csp = construirCsp({
    nonce,
    desarrollo: process.env.NODE_ENV === 'development',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    https: request.nextUrl.protocol === 'https:',
  });
  const encabezadoCsp = modoCsp(process.env.CSP_MODO) === 'observacion' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  request.headers.set('x-nonce', nonce);
  request.headers.set(encabezadoCsp, csp);

  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista: { name: string; value: string; options: CookieOptions }[]) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;
  const privada = ruta.startsWith('/campus') || ruta.startsWith('/admin');

  if (ruta.startsWith('/campus') && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = '/ingresar';
    url.searchParams.set('siguiente', ruta);
    return NextResponse.redirect(url);
  }

  if (privada || ruta.startsWith('/segundo-factor')) respuesta.headers.set('Cache-Control', 'private, no-store');
  respuesta.headers.set(encabezadoCsp, csp);
  return respuesta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|marca/|favicon.ico).*)'],
};
