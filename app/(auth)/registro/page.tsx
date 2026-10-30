'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { registrarse } from '../acciones';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';

export default function Registro() {
  const [estado, accion] = useActionState(registrarse, undefined);
  // La zona horaria se lee en el navegador después de montar, para no desajustar la hidratación.
  const [zona, setZona] = useState('');
  useEffect(() => setZona(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const errorDe = (c: string) => (estado?.campo === c ? estado.error : undefined);

  if (estado?.ok) {
    return (
      <main className="mx-auto flex max-w-[460px] flex-col gap-6 px-5 py-16">
        <h1 className="m-0 text-[40px] leading-tight">Revise su correo</h1>
        <Aviso tipo="ok">{estado.ok}</Aviso>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px] leading-tight">Crear una cuenta</h1>
      {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
      <form action={accion} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="zona" value={zona} />
        <Campo nombre="nombre" etiqueta="Nombre completo" autoComplete="name" ayuda="Así aparecerá en sus certificados." error={errorDe('nombre')} />
        <Campo nombre="correo" etiqueta="Correo electrónico" tipo="email" autoComplete="email" error={errorDe('correo')} />
        <Campo nombre="contrasena" etiqueta="Contraseña" tipo="password" autoComplete="new-password" ayuda="Al menos 10 caracteres." error={errorDe('contrasena')} />
        <label className="flex items-start gap-3">
          <input type="checkbox" name="mayor" className="mt-1.5 size-5 accent-oliva-profundo" aria-describedby={errorDe('mayor') ? 'mayor-error' : undefined} />
          <span>Confirmo que soy mayor de edad.</span>
        </label>
        {errorDe('mayor') && <p id="mayor-error" className="m-0 -mt-3 text-[15px] text-error">{errorDe('mayor')}</p>}
        <label className="flex items-start gap-3">
          <input type="checkbox" name="promociones" className="mt-1.5 size-5 accent-oliva-profundo" />
          <span>Quiero recibir novedades de cursos y talleres. Puedo darme de baja cuando quiera.</span>
        </label>
        <BotonEnviar>Crear mi cuenta</BotonEnviar>
      </form>
      <p className="m-0">¿Ya tiene cuenta? <Link href="/ingresar" className="font-bold text-oliva-profundo underline underline-offset-4">Ingresar</Link></p>
    </main>
  );
}
