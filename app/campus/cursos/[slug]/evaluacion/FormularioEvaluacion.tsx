'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import type { PreguntaEvaluacion } from '@/datos/campus';
import { BotonEnviar, Aviso } from '@/ui/Formulario';
import { rendirEvaluacion, type ResultadoEvaluacion } from '../../../acciones';

function Formulario({ curso, preguntas, alTerminar }: { curso: string; preguntas: PreguntaEvaluacion[]; alTerminar: () => void }) {
  const [estado, accion] = useActionState<ResultadoEvaluacion, FormData>(rendirEvaluacion, undefined);

  if (estado && 'puntaje' in estado) {
    const quedan = estado.intentosRestantes;
    return (
      <div role="status" className={`rounded-2xl p-7 ${estado.aprobado ? 'bg-salvia-claro' : 'bg-arena'}`}>
        <p className="m-0 font-display text-[clamp(28px,3vw,38px)]">{estado.puntaje} puntos</p>
        <p className="m-0 mt-2 text-lg">{estado.mensaje}</p>
        {estado.temasAReforzar.length > 0 && (
          <div className="mt-4 rounded-xl bg-blanco-calido/70 px-4 py-3">
            <p className="m-0 font-bold">{estado.aprobado ? 'Para seguir profundizando, repase:' : 'Le sugerimos repasar estos temas antes de volver a intentarlo:'}</p>
            <ul className="m-0 mt-1.5 list-disc pl-5">{estado.temasAReforzar.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        {!estado.aprobado && quedan !== null && (
          <p className="m-0 mt-2 text-tinta-suave">{quedan === 0 ? 'No le quedan intentos.' : quedan === 1 ? 'Le queda 1 intento.' : `Le quedan ${quedan} intentos.`}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href={`/campus/cursos/${curso}`} className="inline-flex min-h-[54px] items-center rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil no-underline hover:bg-marron">
            {estado.aprobado ? 'Ir a mi certificado' : 'Volver al curso'}
          </Link>
          {!estado.aprobado && quedan !== 0 && (
            <button type="button" onClick={alTerminar} className="min-h-[44px] font-bold text-oliva-profundo underline underline-offset-4">
              Intentar de nuevo
            </button>
          )}
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
          <legend className="sr-only">Pregunta {i + 1}</legend>
          <p className="m-0 text-[15px] font-bold text-tinta-suave">
            Pregunta {i + 1} de {preguntas.length} · {p.tipo === 'unica' ? 'elija una opción' : 'puede elegir varias'}
          </p>
          <p className="m-0 mt-2 text-[19px] font-bold">{p.enunciado}</p>
          <div className="mt-4 flex flex-col gap-1">
            {p.opciones.map((o) => (
              <label key={o.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-arena has-[:checked]:bg-arena">
                <input
                  type={p.tipo === 'unica' ? 'radio' : 'checkbox'}
                  name={`p:${p.id}`}
                  value={o.id}
                  required={p.tipo === 'unica'}
                  className="h-5 w-5 shrink-0 accent-[#4E6049]"
                />
                <span>{o.texto}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <BotonEnviar>Enviar respuestas</BotonEnviar>
        <p className="m-0 text-[15px] text-tinta-suave">Revise sus respuestas antes de enviar: cada envío cuenta como un intento.</p>
      </div>
    </form>
  );
}

/** Cada "Intentar de nuevo" monta un formulario limpio. */
export function FormularioEvaluacion(props: { curso: string; preguntas: PreguntaEvaluacion[] }) {
  const [vuelta, setVuelta] = useState(0);
  return <Formulario key={vuelta} {...props} alTerminar={() => setVuelta((v) => v + 1)} />;
}
