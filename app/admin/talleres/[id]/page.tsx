import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tallerAdmin } from '@/datos/admin-talleres';
import { partesEnZona, vistaPreviaHorario } from '@/dominio/talleres';
import { centavosATexto } from '@/dominio/cursos-admin';
import { AvisoAccion } from '@/ui/admin/campos';
import { TEXTOS_TALLER } from '@/ui/admin/talleres';
import { FormTaller } from './FormTaller';

export const metadata: Metadata = { title: 'Datos del taller' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function DatosTaller({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const t = await tallerAdmin(id);
  if (!t) notFound();
  const p = partesEnZona(t.iniciaEn, t.zonaHoraria);
  const cerrado = ['cancelado', 'finalizado', 'archivado'].includes(t.estado);
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} textos={TEXTOS_TALLER} />
      {t.duplicadoDe && <p className="m-0 mb-5 max-w-[860px] text-[15px] text-tinta-suave">Copia de «{t.duplicadoDe.titulo}».</p>}
      <FormTaller
        vistaPrevia={vistaPreviaHorario(t.iniciaEn, t.zonaHoraria)}
        t={{
          id: t.id, titulo: t.titulo, slug: t.slug, descripcion: t.descripcion ?? '', zona: t.zonaHoraria, fecha: p.fecha, hora: p.hora,
          duracion: String(Math.round((t.terminaEn.getTime() - t.iniciaEn.getTime()) / 60000)),
          gratuito: t.precioCentavos === 0, precio: t.precioCentavos > 0 ? centavosATexto(t.precioCentavos) : '',
          ilimitado: t.cupo === null, cupo: t.cupo ? String(t.cupo) : '', plataforma: t.plataforma, visible: String(t.enlaceVisibleHoras),
          fechaEditable: !cerrado && t.confirmadas + t.reservas === 0, cerrado, minimoCupo: t.confirmadas + t.reservas,
        }}
      />
    </>
  );
}
