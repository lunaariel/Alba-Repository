'use client';

import { useActionState } from 'react';
import { BotonEnviar, Aviso } from '@/ui/Formulario';
import { Entrada, Selector } from '@/ui/admin/campos';
import { ZONAS_TALLER } from '@/dominio/talleres';
import { crearTaller, type EstadoForm } from './acciones';

export function NuevoTaller() {
  const [estado, accion] = useActionState<EstadoForm, FormData>(crearTaller, undefined);
  const err = (c: string) => (estado?.campo === c ? estado.error : undefined);
  return (
    <section aria-labelledby="nuevo" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <h2 id="nuevo" className="m-0 text-[22px]">Nuevo taller</h2>
      <p className="m-0 mt-1 text-[15px] text-tinta-suave">Se crea como borrador: nadie lo ve hasta que lo publique.</p>
      <form action={accion} className="mt-4 flex flex-col gap-4">
        {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
        <Entrada nombre="titulo" etiqueta="Título" required maxLength={140} error={err('titulo')} />
        <Selector nombre="zona" etiqueta="Zona horaria del taller" defaultValue="America/Guatemala" opciones={ZONAS_TALLER.map((z) => ({ valor: z.valor, texto: z.texto }))} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Entrada nombre="fecha" etiqueta="Fecha" type="date" required error={err('fecha')} />
          <Entrada nombre="hora" etiqueta="Hora de inicio" type="time" required />
        </div>
        <Entrada nombre="duracion" etiqueta="Duración (minutos)" inputMode="numeric" defaultValue="90" required error={err('duracion')}
          ayuda="La hora se escribe en la zona del taller, no en la de su computadora." />
        <div><BotonEnviar>Crear taller</BotonEnviar></div>
      </form>
    </section>
  );
}
