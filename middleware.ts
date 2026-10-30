import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Renueva la sesión en cada solicitud y bloquea /campus y /admin sin sesión.
 * El rol admin se vuelve a comprobar en el servidor de cada página y acción (exigirAdmin),
 * no solo aquí.
 */
export async function middleware(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
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

  if (privada && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = '/ingresar';
    url.searchParams.set('siguiente', ruta);
    return NextResponse.redirect(url);
  }

  if (privada) respuesta.headers.set('Cache-Control', 'private, no-store');
  return respuesta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|marca/|favicon.ico).*)'],
};
