'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { AreaTexto, Entrada, Selector } from '@/ui/admin/campos';
import { TIPOS_CORRECCION } from '@/dominio/cursos-admin';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import { guardarLeccion, type Estado } from '../../../acciones';

export function FormLeccion({ leccion, publicada = false }: { publicada?: boolean; leccion: { id: string; curso: string; titulo: string; descripcion: string; duracion: string; video: string } }) {
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
      {publicada && (
        <fieldset className="m-0 flex flex-col gap-4 rounded-xl border-[1.5px] border-borde-bandeja p-4">
          <legend className="px-1 font-bold">Corrección menor</legend>
          <Selector nombre="tipo_correccion" etiqueta="Tipo de corrección" defaultValue="" error={err('tipo_correccion')}
            opciones={[{ valor: '', texto: 'Elija una opción' }, ...TIPOS_CORRECCION]} />
          <AreaTexto nombre="motivo" etiqueta="Motivo (queda registrado)" rows={2} maxLength={500} error={err('motivo')} />
        </fieldset>
      )}
      <div><BotonEnviar>{publicada ? 'Aplicar corrección menor' : 'Guardar lección'}</BotonEnviar></div>
    </form>
  );
}
