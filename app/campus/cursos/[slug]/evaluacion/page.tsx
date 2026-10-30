import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cursoCampus, preguntasEvaluacion } from '@/datos/campus';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { FormularioEvaluacion } from './FormularioEvaluacion';

export const metadata: Metadata = { title: 'Evaluación final' };

type Props = { params: Promise<{ slug: string }> };

export default async function Evaluacion({ params }: Props) {
  const { slug } = await params;
  const curso = await cursoCampus(slug);
  if (!curso?.evaluacion) notFound();
  const ev = curso.evaluacion;
  const yaAprobo = ev.intentos.some((i) => i.aprobado);
  const sinIntentos = ev.intentosPermitidos != null && ev.intentos.length >= ev.intentosPermitidos;
  // Las condiciones se explican en la página del curso; aquí solo se entra si se puede rendir.
  if (curso.pendientes > 0 || yaAprobo || sinIntentos) redirect(`/campus/cursos/${slug}`);

  const preguntas = await preguntasEvaluacion(ev.id);
  const restantes = ev.intentosPermitidos != null ? ev.intentosPermitidos - ev.intentos.length : null;

  return (
    <>
      <EncabezadoCampus
        titulo="Evaluación final"
        volver={{ href: `/campus/cursos/${slug}`, texto: curso.titulo }}
        bajada={
          <>
            {preguntas.length} preguntas. Necesita {ev.puntajeMinimo} puntos sobre 100 para aprobar
            {restantes !== null ? ` y le quedan ${restantes} ${restantes === 1 ? 'intento' : 'intentos'}` : ''}.
          </>
        }
      />
      <Contenedor className="pb-20 pt-2">
        <div className="max-w-[760px]">
          <FormularioEvaluacion curso={slug} preguntas={preguntas} />
        </div>
      </Contenedor>
    </>
  );
}
