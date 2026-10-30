'use client';

import { useActionState } from 'react';
import { enviarMensaje } from './acciones';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';

export function FormularioContacto() {
  const [estado, accion] = useActionState(enviarMensaje, undefined);
  const errorDe = (c: string) => (estado?.campo === c ? estado.error : undefined);

  if (estado?.ok) return <Aviso tipo="ok">Recibimos su mensaje. Le respondemos por correo lo antes posible.</Aviso>;

  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
      <Campo nombre="nombre" etiqueta="Nombre" autoComplete="name" error={errorDe('nombre')} />
      <Campo nombre="correo" etiqueta="Correo electrónico" tipo="email" autoComplete="email" error={errorDe('correo')} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mensaje" className="text-[15px] font-bold">Mensaje</label>
        <textarea
          id="mensaje"
          name="mensaje"
          rows={6}
          aria-invalid={errorDe('mensaje') ? true : undefined}
          aria-describedby={errorDe('mensaje') ? 'mensaje-error' : undefined}
          className={`rounded-md border-[1.5px] bg-blanco-calido p-4 text-marron ${errorDe('mensaje') ? 'border-error' : 'border-borde-control'}`}
        />
        {errorDe('mensaje') && <p id="mensaje-error" className="m-0 text-[15px] text-error">{errorDe('mensaje')}</p>}
      </div>
      {/* Campo trampa contra spam: oculto para personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label htmlFor="sitio_web">No completar</label>
        <input id="sitio_web" name="sitio_web" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <BotonEnviar>Enviar mensaje</BotonEnviar>
    </form>
  );
}
