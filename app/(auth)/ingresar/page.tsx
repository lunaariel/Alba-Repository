'use client';

import Link from 'next/link';
import { Suspense, useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ingresar } from '../acciones';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';

export default function PaginaIngresar() {
  return (
    <Suspense>
      <Ingresar />
    </Suspense>
  );
}

function Ingresar() {
  const params = useSearchParams();
  const [estado, accion] = useActionState(ingresar, undefined);
  const enlaceInvalido = params.get('aviso') === 'enlace_invalido';

  return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px] leading-tight">Ingresar</h1>
      {enlaceInvalido && <Aviso tipo="error">El enlace venció o ya se usó. Ingrese o pida uno nuevo.</Aviso>}
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <form action={accion} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="siguiente" value={params.get('siguiente') ?? '/campus'} />
        <Campo nombre="correo" etiqueta="Correo electrónico" tipo="email" autoComplete="email" error={estado?.campo === 'correo' ? estado.error : undefined} />
        <Campo nombre="contrasena" etiqueta="Contraseña" tipo="password" autoComplete="current-password" error={estado?.campo === 'contrasena' ? estado.error : undefined} />
        <BotonEnviar>Ingresar</BotonEnviar>
      </form>
      <p className="m-0"><Link href="/recuperar" className="font-bold text-oliva-profundo underline underline-offset-4">Olvidé mi contraseña</Link></p>
      <p className="m-0">¿Todavía no tiene cuenta? <Link href="/registro" className="font-bold text-oliva-profundo underline underline-offset-4">Crear una cuenta</Link></p>
    </main>
  );
}
