'use client';

import { useActionState } from 'react';
import { restablecer } from '../acciones';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';

export default function Restablecer() {
  const [estado, accion] = useActionState(restablecer, undefined);
  const errorDe = (c: string) => (estado?.campo === c ? estado.error : undefined);
  return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px] leading-tight">Elegir una nueva contraseña</h1>
      {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
      <form action={accion} className="flex flex-col gap-5" noValidate>
        <Campo nombre="contrasena" etiqueta="Nueva contraseña" tipo="password" autoComplete="new-password" ayuda="Al menos 10 caracteres." error={errorDe('contrasena')} />
        <Campo nombre="repetir" etiqueta="Repita la contraseña" tipo="password" autoComplete="new-password" error={errorDe('repetir')} />
        <BotonEnviar>Guardar la contraseña</BotonEnviar>
      </form>
    </main>
  );
}
