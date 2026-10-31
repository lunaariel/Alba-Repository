import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { AvisoAccion } from '@/ui/admin/campos';
import { BloqueoExcepcional } from '@/ui/admin/BloqueoExcepcional';
import { bloquearContenido } from '../../../acciones';
import { EditorPregunta } from './EditorPregunta';

export const metadata: Metadata = { title: 'Pregunta' };

type Props = { params: Promise<{ id: string; pregunta: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function EditarPregunta({ params, searchParams }: Props) {
  const [{ id, pregunta }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  if (!c) notFound();
  const nueva = pregunta === 'nueva';
  const p = nueva ? null : c.evaluacion?.preguntas.find((x) => x.id === pregunta);
  if (!nueva && !p) notFound();
  const temas = [...new Set((c.evaluacion?.preguntas ?? []).map((x) => x.tema).filter((t): t is string => Boolean(t)))];
  return (
    <>
      <Link href={`/admin/cursos/${c.id}/evaluacion`} className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 font-bold text-oliva-profundo no-underline hover:underline">
        <span aria-hidden="true">←</span> Volver a la evaluación
      </Link>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <h2 className="m-0 mb-4 text-[26px]">{nueva ? 'Nueva pregunta' : 'Editar pregunta'}</h2>
      {p && p.versiones.length > 0 && (
        <div className="mb-5 flex max-w-[860px] flex-col gap-3 rounded-xl bg-arena px-5 py-3.5 text-[15px]">
          <p className="m-0">
            Esta pregunta forma parte de {p.versiones.length === 1 ? 'la versión publicada' : 'las versiones publicadas'} {p.versiones.join(', ')} y no se modifica.
            Si guarda cambios, se crea una pregunta nueva para el borrador y esta se conserva intacta para quienes siguen esas versiones.
          </p>
          <p className="m-0">
            ¿La clave tiene un error y perjudicó a alumnos? <Link href={`/admin/cursos/${c.id}/evaluacion/${p.id}/revision`} className="font-bold text-oliva-profundo">Revisión favorable</Link>:
            acepta también otra respuesta y solo puede subir resultados.
          </p>
        </div>
      )}
      {p && p.respuestas > 0 && p.versiones.length === 0 && (
        <p className="m-0 mb-5 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
          Esta pregunta ya fue respondida {p.respuestas === 1 ? '1 vez' : `${p.respuestas} veces`}. Puede corregir textos y cambiar la respuesta correcta:
          vale para los intentos futuros y no recalcula los anteriores. Sus opciones no se pueden eliminar, pero sí agregar nuevas.
        </p>
      )}
      <EditorPregunta
        curso={c.id}
        pregunta={p ? { id: p.id, enunciado: p.enunciado, tipo: p.tipo, tema: p.tema ?? '', opciones: p.opciones.map((o) => ({ id: o.id, texto: o.texto, es_correcta: o.esCorrecta })) } : null}
        bloquearBorrado={Boolean(p && p.respuestas > 0)}
        temas={temas}
      />
      {p && p.versiones.length > 0 && (
        <BloqueoExcepcional accion={bloquearContenido} tabla="preguntas" id={p.id} volver={`/admin/cursos/${c.id}/evaluacion/${p.id}`}
          nombre={p.enunciado} tipo="la pregunta" bloqueada={p.marca.bloqueada} motivo={p.marca.bloqueoMotivo} />
      )}
    </>
  );
}
