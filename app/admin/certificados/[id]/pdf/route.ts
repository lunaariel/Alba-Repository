import { NextResponse, type NextRequest } from 'next/server';
import { exigirAdminAccion } from '@/datos/sesion';
import { clienteSesion } from '@/datos/supabase';
import { respuestaCertificadoPdf } from '@/datos/certificado-pdf';

export const dynamic = 'force-dynamic';

/** PDF de cualquier certificado, solo para la administradora (con segundo factor si la política lo exige). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await exigirAdminAccion();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('No encontrado', { status: 404 });
  const { data: c } = await (await clienteSesion()).from('certificados')
    .select('nombre_en_certificado, titulo_curso, emitido_en, codigo_verificacion, version_id').eq('id', id).maybeSingle();
  if (!c) return new NextResponse('No encontrado', { status: 404 });
  return respuestaCertificadoPdf(c);
}
