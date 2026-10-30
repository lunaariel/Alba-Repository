import { NextResponse, type NextRequest } from 'next/server';
import { clienteSesion, clienteServicio } from '@/datos/supabase';

export const dynamic = 'force-dynamic';

/**
 * Descarga de un PDF del curso. RLS solo deja leer el material a quien tiene acceso al curso;
 * recién entonces el servidor firma una URL de Storage que vence en 5 minutos.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('No encontrado', { status: 404 });
  const supabase = await clienteSesion();
  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario.user) return NextResponse.redirect(new URL(`/ingresar?siguiente=/campus`, request.url));

  const { data: material } = await supabase.from('recursos_leccion').select('titulo, ruta_almacenamiento').eq('id', id).maybeSingle();
  if (!material) return new NextResponse('No encontrado', { status: 404 });

  const nombre = `${material.titulo.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'material'}.pdf`;
  const { data, error } = await clienteServicio().storage.from('materiales')
    .createSignedUrl(material.ruta_almacenamiento, 300, { download: nombre });
  if (error || !data) {
    return new NextResponse('El material todavía no está disponible. Escríbanos si lo necesita.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const respuesta = NextResponse.redirect(data.signedUrl, 303);
  respuesta.headers.set('Cache-Control', 'private, no-store');
  return respuesta;
}
