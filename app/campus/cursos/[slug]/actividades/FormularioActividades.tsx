'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import type { PreguntaEvaluacion } from '@/datos/campus';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { enviarActividades, type ResultadoActividades } from '../../../acciones';

function Formulario({ curso, preguntas, otraVez }: { curso: string; preguntas: PreguntaEvaluacion[]; otraVez: () => void }) {
  const [estado, accion] = useActionState<ResultadoActividades, FormData>(enviarActividades, undefined);

  if (estado && 'completo' in estado) {
    return (
      <div role="status" className={`rounded-2xl p-7 ${estado.completo ? 'bg-salvia-claro' : 'bg-arena'}`}>
        <p className="m-0 font-display text-[clamp(26px,3vw,34px)]">{estado.completo ? 'Actividades completadas' : 'Faltan respuestas'}</p>
        <p className="m-0 mt-2 text-lg">
          {estado.completo
            ? 'Respondió todas las preguntas. Gracias por hacerlas con calma.'
            : `Respondió ${estado.respondidas} de ${estado.total}. Para completarlas, responda todas.`}
        </p>
        {estado.temasAReforzar.length > 0 && (
          <div className="mt-4 rounded-xl bg-blanco-calido/70 px-4 py-3">
            <p className="m-0 font-bold">Para seguir profundizando, le sugerimos repasar:</p>
            <ul className="m-0 mt-1.5 list-disc pl-5">{estado.temasAReforzar.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href={`/campus/cursos/${curso}`} className="inline-flex min-h-[54px] items-center rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil no-underline hover:bg-marron">
            Volver al curso
          </Link>
          <button type="button" onClick={otraVez} className="min-h-[44px] font-bold text-oliva-profundo underline underline-offset-4">Hacerlas de nuevo</button>
        </div>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-8">
      <input type="hidden" name="curso" value={curso} />
      {estado && 'error' in estado && <Aviso tipo="error">{estado.error}</Aviso>}
      {preguntas.map((p, i) => (
        <fieldset key={p.id} className="m-0 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <legend className="sr-only">Actividad {i + 1}</legend>
          <p className="m-0 text-[15px] font-bold text-tinta-suave">
            Actividad {i + 1} de {preguntas.length} · {p.tipo === 'unica' ? 'elija una opción' : 'puede elegir varias'}
          </p>
          <p className="m-0 mt-2 text-[19px] font-bold">{p.enunciado}</p>
          <div className="mt-4 flex flex-col gap-1">
            {p.opciones.map((o) => (
              <label key={o.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-arena has-[:checked]:bg-arena">
                <input type={p.tipo === 'unica' ? 'radio' : 'checkbox'} name={`p:${p.id}`} value={o.id} className="h-5 w-5 shrink-0 accent-[#4E6049]" />
                <span>{o.texto}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <BotonEnviar>Enviar mis respuestas</BotonEnviar>
        <p className="m-0 text-[15px] text-tinta-suave">No hay nota ni límite de envíos.</p>
      </div>
    </form>
  );
}

export function FormularioActividades(props: { curso: string; preguntas: PreguntaEvaluacion[] }) {
  const [vuelta, setVuelta] = useState(0);
  return <Formulario key={vuelta} {...props} otraVez={() => setVuelta((v) => v + 1)} />;
}
