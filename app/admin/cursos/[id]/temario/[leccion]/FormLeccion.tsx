'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { AreaTexto, Entrada } from '@/ui/admin/campos';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import { guardarLeccion, type Estado } from '../../../acciones';

export function FormLeccion({ leccion }: { leccion: { id: string; curso: string; titulo: string; descripcion: string; duracion: string; video: string } }) {
  const [estado, accion] = useActionState<Estado, FormData>(guardarLeccion, undefined);
  const err = (c: string) => (estado?.campo === c ? estado.error : undefined);
  return (
    <form action={accion} className="flex flex-col gap-5">
      <GuardiaCambios />
      <input type="hidden" name="id" value={leccion.id} />
      <input type="hidden" name="curso" value={leccion.curso} />
      {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <Entrada nombre="titulo" etiqueta="Título" defaultValue={leccion.titulo} required maxLength={140} error={err('titulo')} />
      <AreaTexto nombre="descripcion" etiqueta="Descripción para el alumno" defaultValue={leccion.descripcion} rows={6} maxLength={8000}
        ayuda="Aparece debajo del video. Separe los párrafos con una línea en blanco." error={err('descripcion')} />
      <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
        <Entrada nombre="duracion" etiqueta="Duración (min)" inputMode="numeric" defaultValue={leccion.duracion} error={err('duracion')} />
        <Entrada nombre="video" etiqueta="Video (id de Bunny, biblioteca privada)" defaultValue={leccion.video} error={err('video')}
          ayuda="Pegue el id del video que subió a Bunny. La subida desde el panel llega al conectar Bunny (Fase 6)." />
      </div>
      <div><BotonEnviar>Guardar lección</BotonEnviar></div>
    </form>
  );
}
