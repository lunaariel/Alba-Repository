import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cursoCampus, preguntasEvaluacion } from '@/datos/campus';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { FormularioActividades } from './FormularioActividades';

export const metadata: Metadata = { title: 'Actividades formativas' };

type Props = { params: Promise<{ slug: string }> };

/** Actividades formativas de la versión del alumno. Se pueden responder cuantas veces quiera, sin nota. */
export default async function Actividades({ params }: Props) {
  const { slug } = await params;
  const curso = await cursoCampus(slug);
  if (!curso?.actividades) notFound();
  const preguntas = await preguntasEvaluacion(curso.actividades.evaluacionId, curso.id);
  const hecho = curso.finalizacion?.actividadesCompletas ?? false;
  return (
    <>
      <EncabezadoCampus
        titulo="Actividades formativas"
        volver={{ href: `/campus/cursos/${slug}`, texto: curso.titulo }}
        bajada={<>No llevan nota. Responda todas las preguntas: al enviar, le sugerimos temas para repasar. Puede volver a hacerlas cuando quiera.
          {hecho ? ' Ya las completó al menos una vez.' : ''}</>}
      />
      <Contenedor className="pb-20 pt-2">
        <div className="max-w-[760px]">
          <FormularioActividades curso={slug} preguntas={preguntas} />
        </div>
      </Contenedor>
    </>
  );
}
