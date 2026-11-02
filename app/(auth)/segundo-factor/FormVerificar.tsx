'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';
import { verificarIngreso } from './acciones';

export function FormVerificar({ siguiente }: { siguiente: string }) {
  const [estado, accion] = useActionState(verificarIngreso, undefined);
  return (
    <>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <form action={accion} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="siguiente" value={siguiente} />
        <Campo nombre="codigo" etiqueta="Código de 6 dígitos" autoComplete="one-time-code" modoEntrada="numeric" largoMaximo={7} />
        <BotonEnviar>Verificar</BotonEnviar>
      </form>
    </>
  );
}
