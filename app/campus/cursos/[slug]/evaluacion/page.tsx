import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cursoCampus, preguntasEvaluacion } from '@/datos/campus';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { EnlaceBoton } from '@/ui/acciones';
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
  if (curso.pendientes > 0 || (sinIntentos && !yaAprobo)) redirect(`/campus/cursos/${slug}`);
  if (yaAprobo) {
    const mejor = Math.max(...ev.intentos.filter((i) => i.aprobado).map((i) => i.puntaje));
    return (
      <>
        <EncabezadoCampus titulo="Evaluación final" volver={{ href: `/campus/cursos/${slug}`, texto: curso.titulo }} />
        <Contenedor className="pb-20 pt-2">
          <div className="max-w-[760px] rounded-2xl bg-salvia-claro p-7">
            <p className="m-0 font-display text-[clamp(28px,3vw,38px)]">Aprobada con {mejor} puntos</p>
            <div className="mt-5"><EnlaceBoton href={`/campus/cursos/${slug}#certificado`}>Ir a mi certificado</EnlaceBoton></div>
          </div>
        </Contenedor>
      </>
    );
  }

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
