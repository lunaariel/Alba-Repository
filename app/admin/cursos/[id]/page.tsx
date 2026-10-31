import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { AvisoAccion } from '@/ui/admin/campos';
import { FormDatosCurso } from './FormDatosCurso';

export const metadata: Metadata = { title: 'Datos del curso' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function DatosCurso({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  if (!c) notFound();
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <FormDatosCurso
        curso={{
          id: c.id, titulo: c.titulo, slug: c.slug, resumen: c.resumen ?? '', descripcion: c.descripcion ?? '', requisitos: c.requisitos ?? '',
          objetivos: c.objetivos.join('\n'), publico: c.publico, edadDesde: Math.floor((c.edadDesdeMeses ?? 0) / 12),
          edadHasta: Math.ceil((c.edadHastaMeses ?? 72) / 12), duracionHoras: c.duracionMinutos ? String(Math.round(c.duracionMinutos / 6) / 10) : '',
          precioCentavos: c.precioCentavos, video: c.videoPresentacionId ?? '', estado: c.estado,
        }}
        alumnos={c.historial.alumnos}
      />
    </>
  );
}
