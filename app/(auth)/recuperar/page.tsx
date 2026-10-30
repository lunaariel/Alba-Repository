'use client';

import { useActionState } from 'react';
import { pedirRecuperacion } from '../acciones';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';

export default function Recuperar() {
  const [estado, accion] = useActionState(pedirRecuperacion, undefined);
  return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px] leading-tight">Olvidé mi contraseña</h1>
      <p className="m-0">Escriba su correo y le enviaremos un enlace para elegir una nueva.</p>
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <form action={accion} className="flex flex-col gap-5" noValidate>
        <Campo nombre="correo" etiqueta="Correo electrónico" tipo="email" autoComplete="email" error={estado?.error} />
        <BotonEnviar>Enviar el enlace</BotonEnviar>
      </form>
    </main>
  );
}
