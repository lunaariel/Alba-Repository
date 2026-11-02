'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';
import { confirmarActivacion, iniciarActivacion, type EstadoActivacion } from '../acciones';

/** Dos pasos: Supabase Auth genera el QR y el secreto (se muestran una sola vez) y la persona confirma con un código. */
export function Activar({ siguiente }: { siguiente: string }) {
  const [inicio, iniciar] = useActionState<EstadoActivacion>(iniciarActivacion, undefined);
  const [confirmacion, confirmar] = useActionState<EstadoActivacion, FormData>(confirmarActivacion, undefined);
  const datos = inicio;
  if (!datos?.factorId) {
    return (
      <>
        {inicio?.error && <Aviso tipo="error">{inicio.error}</Aviso>}
        <form action={iniciar}><BotonEnviar>Generar el código QR</BotonEnviar></form>
      </>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <ol className="m-0 flex list-decimal flex-col gap-2 pl-5">
        <li>En su app autenticadora, elija «Agregar cuenta» y escanee este código.</li>
        <li>Escriba el código de 6 dígitos que aparece para Albor.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado por Supabase Auth (data:) */}
      <img src={datos.qr} alt="Código QR para la app autenticadora" width={200} height={200} className="rounded-lg bg-blanco-calido p-2" />
      <details className="text-[15px]">
        <summary className="cursor-pointer font-bold">No puedo escanear el código</summary>
        <p className="m-0 mt-2">Escriba esta clave en la app (tipo «basada en tiempo»):</p>
        <p className="m-0 mt-1 break-all font-mono text-[16px]" data-secreto-totp>{datos.secreto}</p>
      </details>
      {confirmacion?.error && <Aviso tipo="error">{confirmacion.error}</Aviso>}
      <form action={confirmar} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="factorId" value={datos.factorId} />
        <input type="hidden" name="siguiente" value={siguiente} />
        <Campo nombre="codigo" etiqueta="Código de 6 dígitos" autoComplete="one-time-code" modoEntrada="numeric" largoMaximo={7} />
        <BotonEnviar>Confirmar y activar</BotonEnviar>
      </form>
    </div>
  );
}
