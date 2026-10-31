'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { AreaTexto, Entrada } from '@/ui/admin/campos';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import { guardarCriterios, type Estado } from '../../acciones';

export function FormCriterios({ curso, criterios, conIntentos }: {
  curso: string; criterios: { puntaje: string; intentos: string; aprobado: string; desaprobado: string }; conIntentos: boolean;
}) {
  const [estado, accion] = useActionState<Estado, FormData>(guardarCriterios, undefined);
  const err = (c: string) => (estado?.campo === c ? estado.error : undefined);
  return (
    <section aria-labelledby="criterios" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <h2 id="criterios" className="m-0 text-[22px]">Criterios de aprobación</h2>
      <form action={accion} className="mt-4 flex flex-col gap-4">
        <GuardiaCambios />
        <input type="hidden" name="curso" value={curso} />
        {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
        {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
        <div className="grid grid-cols-2 gap-4">
          <Entrada nombre="puntaje" etiqueta="Puntaje mínimo (0 a 100)" inputMode="numeric" defaultValue={criterios.puntaje} required error={err('puntaje')} />
          <Entrada nombre="intentos" etiqueta="Intentos permitidos" inputMode="numeric" defaultValue={criterios.intentos} placeholder="Sin límite" error={err('intentos')} />
        </div>
        <AreaTexto nombre="aprobado" etiqueta="Mensaje al aprobar" defaultValue={criterios.aprobado} rows={2} maxLength={300} error={err('aprobado')} />
        <AreaTexto nombre="desaprobado" etiqueta="Mensaje al no aprobar" defaultValue={criterios.desaprobado} rows={2} maxLength={300} error={err('desaprobado')} />
        {conIntentos && <p className="m-0 text-[14px] text-tinta-suave">Los cambios valen desde el próximo intento; los anteriores no se recalculan.</p>}
        <div><BotonEnviar>Guardar criterios</BotonEnviar></div>
      </form>
    </section>
  );
}
