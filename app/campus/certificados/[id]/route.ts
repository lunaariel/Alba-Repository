import { NextResponse, type NextRequest } from 'next/server';
import { clienteServicio, clienteSesion } from '@/datos/supabase';
import { entornoPublico } from '@/config/entorno';
import { configuracion } from '@/datos/publico';
import { generarCertificadoPdf } from '@/servicios/certificados/pdf';

export const dynamic = 'force-dynamic';

/**
 * PDF del certificado. Se arma en cada descarga con los datos congelados al emitirlo:
 * regenerarlo nunca crea otro certificado. RLS: cada persona solo lee los suyos.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('No encontrado', { status: 404 });
  const supabase = await clienteSesion();
  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario.user) return NextResponse.redirect(new URL('/ingresar?siguiente=/campus', request.url));

  const { data: c } = await supabase.from('certificados')
    .select('nombre_en_certificado, titulo_curso, emitido_en, codigo_verificacion, version_id').eq('id', id).maybeSingle();
  if (!c) return new NextResponse('No encontrado', { status: 404 });

  // El certificado ya pasó el control de RLS; el número de versión puede ser de una versión
  // que el alumno ya no sigue (cambió voluntariamente), por eso se lee con el cliente de servicio.
  const { data: v } = await clienteServicio().from('versiones_curso').select('numero').eq('id', c.version_id).maybeSingle();
  const config = await configuracion();
  const pdf = await generarCertificadoPdf({
    nombre: c.nombre_en_certificado,
    curso: c.titulo_curso,
    emitidoEn: new Date(c.emitido_en),
    codigo: c.codigo_verificacion,
    urlVerificacion: `${entornoPublico.NEXT_PUBLIC_URL_SITIO.replace(/\/$/, '')}/verificar/${c.codigo_verificacion}`,
    academia: config.nombre,
    version: v?.numero,
  });
  const archivo = `certificado-${c.codigo_verificacion}.pdf`;
  const cuerpo = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${archivo}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
