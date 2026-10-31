'use client';

import { useActionState } from 'react';
import { BotonEnviar, Aviso } from '@/ui/Formulario';
import { Entrada } from '@/ui/admin/campos';
import { crearCurso, type Estado } from './acciones';

export function NuevoCurso() {
  const [estado, accion] = useActionState<Estado, FormData>(crearCurso, undefined);
  return (
    <section aria-labelledby="nuevo" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <h2 id="nuevo" className="m-0 text-[22px]">Nuevo curso</h2>
      <p className="m-0 mt-1 text-[15px] text-tinta-suave">Se crea como borrador: nadie lo ve hasta que lo publique.</p>
      <form action={accion} className="mt-4 flex flex-col gap-4">
        {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
        <Entrada nombre="titulo" etiqueta="Título" required maxLength={140} error={estado?.campo === 'titulo' ? estado.error : undefined} />
        <Entrada nombre="precio" etiqueta="Precio en USD" inputMode="decimal" placeholder="49" ayuda="Puede cambiarlo después." error={estado?.campo === 'precio' ? estado.error : undefined} />
        <div><BotonEnviar>Crear curso</BotonEnviar></div>
      </form>
    </section>
  );
}
