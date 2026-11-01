'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { AreaTexto, Entrada } from '@/ui/admin/campos';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import { guardarPresentacion, type EstadoPresentacion } from './acciones';

export interface DatosPresentacion {
  maestraNombre: string; maestraLema: string; maestraResumen: string; maestraFrase: string; maestraHistoria: string;
  trayectoria: string; aprobada: boolean;
}

export function FormPresentacion({ p }: { p: DatosPresentacion }) {
  const [estado, accion] = useActionState<EstadoPresentacion, FormData>(guardarPresentacion, undefined);
  const err = (c: string) => (estado?.campo === c ? estado.error : undefined);
  return (
    <form action={accion} className="flex flex-col gap-5">
      <GuardiaCambios />
      {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <Entrada nombre="maestraNombre" etiqueta="Nombre" defaultValue={p.maestraNombre} required maxLength={120} error={err('maestraNombre')} />
      <Entrada nombre="maestraLema" etiqueta="Frase de presentación" defaultValue={p.maestraLema} maxLength={160} error={err('maestraLema')}
        ayuda="Aparece sobre el nombre en la página «La maestra»." />
      <AreaTexto nombre="maestraResumen" etiqueta="Resumen" defaultValue={p.maestraResumen} rows={3} maxLength={600} error={err('maestraResumen')} />
      <AreaTexto nombre="maestraFrase" etiqueta="Una frase suya" defaultValue={p.maestraFrase} rows={2} maxLength={300} error={err('maestraFrase')} />
      <AreaTexto nombre="maestraHistoria" etiqueta="Su historia" defaultValue={p.maestraHistoria} rows={6} maxLength={8000} error={err('maestraHistoria')}
        ayuda="Separe los párrafos con una línea en blanco. Mientras sea un texto entre corchetes, la página no aparece en buscadores." />
      <AreaTexto nombre="trayectoria" etiqueta="Formación y trayectoria (una por línea)" defaultValue={p.trayectoria} rows={8} maxLength={4000} error={err('trayectoria')}
        ayuda="Tal como usted la cuente. No se agregan instituciones, fechas ni distinciones que no haya informado." />
      <label className="flex items-start gap-2.5 rounded-xl bg-arena px-4 py-3">
        <input type="checkbox" name="aprobada" value="si" defaultChecked={p.aprobada} className="mt-1 h-5 w-5 shrink-0 accent-[#4E6049]" />
        <span><b>Revisé y apruebo estos textos para publicarlos.</b>
          <span className="block text-[14px] text-tinta-suave">Sin esta marca, la frase de presentación y la trayectoria no se muestran en el sitio.</span></span>
      </label>
      <div><BotonEnviar>Guardar</BotonEnviar></div>
    </form>
  );
}
