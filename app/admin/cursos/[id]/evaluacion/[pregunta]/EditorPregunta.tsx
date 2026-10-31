'use client';

import { useActionState, useState } from 'react';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { AreaTexto, Entrada } from '@/ui/admin/campos';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import { guardarPregunta, type Estado } from '../../../acciones';

type Opcion = { id: string | null; texto: string; es_correcta: boolean; clave: string };
let siguiente = 0;
const clave = () => `o${++siguiente}`;

export function EditorPregunta({ curso, pregunta, bloquearBorrado, temas }: {
  curso: string;
  pregunta: { id: string; enunciado: string; tipo: 'unica' | 'multiple'; tema: string; opciones: { id: string; texto: string; es_correcta: boolean }[] } | null;
  bloquearBorrado: boolean;
  temas: string[];
}) {
  const [estado, accion] = useActionState<Estado, FormData>(guardarPregunta, undefined);
  const [tipo, setTipo] = useState<'unica' | 'multiple'>(pregunta?.tipo ?? 'unica');
  const [opciones, setOpciones] = useState<Opcion[]>(
    pregunta?.opciones.map((o) => ({ ...o, clave: clave() })) ?? [
      { id: null, texto: '', es_correcta: true, clave: clave() },
      { id: null, texto: '', es_correcta: false, clave: clave() },
    ],
  );
  const cambiar = (i: number, cambio: Partial<Opcion>) => setOpciones((ops) => ops.map((o, j) => (j === i ? { ...o, ...cambio } : o)));
  const marcar = (i: number) =>
    setOpciones((ops) => ops.map((o, j) => (tipo === 'unica' ? { ...o, es_correcta: j === i } : j === i ? { ...o, es_correcta: !o.es_correcta } : o)));
  const mover = (i: number, d: -1 | 1) =>
    setOpciones((ops) => { const n = [...ops]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); return n; });
  const cambiarTipo = (t: 'unica' | 'multiple') => {
    setTipo(t);
    if (t === 'unica') {
      // Al pasar a opción única, queda solo la primera correcta.
      let vista = false;
      setOpciones((ops) => ops.map((o) => { const c = o.es_correcta && !vista; if (c) vista = true; return { ...o, es_correcta: c }; }));
    }
  };

  return (
    <form action={accion} className="flex max-w-[860px] flex-col gap-6">
      <GuardiaCambios />
      <input type="hidden" name="curso" value={curso} />
      <input type="hidden" name="pregunta" value={pregunta?.id ?? ''} />
      <input type="hidden" name="opciones" value={JSON.stringify(opciones.map(({ id, texto, es_correcta }) => ({ id, texto, es_correcta })))} />
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}

      <AreaTexto nombre="enunciado" etiqueta="Pregunta" defaultValue={pregunta?.enunciado ?? ''} rows={3} required maxLength={1000} />
      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 text-[15px] font-bold">Tipo de respuesta</legend>
          {(['unica', 'multiple'] as const).map((t) => (
            <label key={t} className="flex min-h-[40px] items-center gap-2.5">
              <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => cambiarTipo(t)} className="h-5 w-5 accent-[#4E6049]" />
              {t === 'unica' ? 'Opción única (una correcta)' : 'Opción múltiple (una o más correctas)'}
            </label>
          ))}
        </fieldset>
        <div>
          <Entrada nombre="tema" etiqueta="Tema (para la devolución)" defaultValue={pregunta?.tema ?? ''} maxLength={80} list="temas-existentes"
            ayuda="Si el alumno falla, se le sugiere reforzar este tema, sin decirle qué pregunta falló." />
          <datalist id="temas-existentes">{temas.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[15px] font-bold">Opciones · marque {tipo === 'unica' ? 'la correcta' : 'las correctas'}</legend>
        {opciones.map((o, i) => (
          <div key={o.clave} className={`flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 ${o.es_correcta ? 'border-[#93A68A] bg-salvia-claro/50' : 'border-borde-bandeja bg-blanco-calido'}`}>
            <label className="flex min-h-[40px] shrink-0 items-center gap-2 text-[14px] font-bold">
              <input type={tipo === 'unica' ? 'radio' : 'checkbox'} name="correcta-visual" checked={o.es_correcta} onChange={() => marcar(i)} className="h-5 w-5 accent-[#4E6049]"
                aria-label={`Opción ${i + 1} correcta`} />
              Correcta
            </label>
            <input value={o.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} maxLength={300} required aria-label={`Texto de la opción ${i + 1}`}
              placeholder={`Opción ${i + 1}`} className="min-h-[44px] min-w-0 flex-[1_1_240px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron" />
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir la opción ${i + 1}`} className="h-[34px] w-[34px] rounded-md border-[1.5px] border-borde-bandeja bg-marfil disabled:opacity-35">▲</button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === opciones.length - 1} aria-label={`Bajar la opción ${i + 1}`} className="h-[34px] w-[34px] rounded-md border-[1.5px] border-borde-bandeja bg-marfil disabled:opacity-35">▼</button>
              {!(bloquearBorrado && o.id) && (
                <button type="button" onClick={() => setOpciones((ops) => ops.filter((_, j) => j !== i))} disabled={opciones.length <= 2}
                  className="min-h-[34px] px-2 text-[14px] font-bold text-error underline underline-offset-4 disabled:opacity-35">Quitar</button>
              )}
            </div>
          </div>
        ))}
        <div>
          <button type="button" onClick={() => setOpciones((ops) => [...ops, { id: null, texto: '', es_correcta: false, clave: clave() }])} disabled={opciones.length >= 10}
            className="min-h-[44px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-4 font-bold text-oliva-profundo disabled:opacity-40">+ Agregar opción</button>
        </div>
      </fieldset>
      <div><BotonEnviar>{pregunta ? 'Guardar pregunta' : 'Crear pregunta'}</BotonEnviar></div>
    </form>
  );
}
