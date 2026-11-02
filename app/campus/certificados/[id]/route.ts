import { NextResponse, type NextRequest } from 'next/server';
import { clienteSesion } from '@/datos/supabase';
import { respuestaCertificadoPdf } from '@/datos/certificado-pdf';

export const dynamic = 'force-dynamic';

/**
 * PDF del certificado propio. El campus es personal: solo los certificados de la persona que ingresó, también para
 * la administradora (los de otras personas los descarga desde el panel, /admin/certificados). RLS repite el control.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('No encontrado', { status: 404 });
  const supabase = await clienteSesion();
  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario.user) return NextResponse.redirect(new URL('/ingresar?siguiente=/campus', request.url));
  const { data: c } = await supabase.from('certificados')
    .select('nombre_en_certificado, titulo_curso, emitido_en, codigo_verificacion, version_id')
    .eq('id', id).eq('perfil_id', usuario.user.id).maybeSingle();
  if (!c) return new NextResponse('No encontrado', { status: 404 });
  return respuestaCertificadoPdf(c);
}
