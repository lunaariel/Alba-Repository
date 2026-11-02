import 'server-only';
import { NextResponse } from 'next/server';
import { clienteServicio } from './supabase';
import { entornoPublico } from '@/config/entorno';
import { configuracion } from './publico';
import { generarCertificadoPdf } from '@/servicios/certificados/pdf';

export type FilaCertificado = { nombre_en_certificado: string; titulo_curso: string; emitido_en: string; codigo_verificacion: string; version_id: string };

/** Arma el PDF con los datos congelados al emitir el certificado (regenerarlo nunca crea otro certificado). */
export async function respuestaCertificadoPdf(c: FilaCertificado): Promise<NextResponse> {
  // El número de versión puede ser de una versión que la persona ya no sigue: se lee con la clave de servicio.
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
  const cuerpo = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="certificado-${c.codigo_verificacion}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
