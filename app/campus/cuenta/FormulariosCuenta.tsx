'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar, Campo } from '@/ui/Formulario';
import { cambiarContrasena, guardarCuenta, type EstadoCuenta } from '../acciones';

export function FormularioDatos({ nombre, zona, zonas, areaLaboral, estudios }: {
  nombre: string; zona: string; zonas: { valor: string; texto: string }[]; areaLaboral: string; estudios: string;
}) {
  const [estado, accion] = useActionState<EstadoCuenta, FormData>(guardarCuenta, undefined);
  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nombre" className="text-[15px] font-bold">Nombre completo</label>
        <input
          id="nombre" name="nombre" defaultValue={nombre} autoComplete="name" required
          aria-describedby="nombre-ayuda" aria-invalid={estado?.campo === 'nombre' ? true : undefined}
          className="min-h-[52px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 text-marron"
        />
        <p id="nombre-ayuda" className="m-0 text-[15px] text-tinta-suave">
          Así aparecerá en los certificados nuevos. Los que ya recibió conservan el nombre con el que se emitieron.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="zona" className="text-[15px] font-bold">Zona horaria</label>
        <select
          id="zona" name="zona" defaultValue={zona} aria-describedby="zona-ayuda"
          className="min-h-[52px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 text-marron"
        >
          {zonas.map((z) => <option key={z.valor} value={z.valor}>{z.texto}</option>)}
        </select>
        <p id="zona-ayuda" className="m-0 text-[15px] text-tinta-suave">La usamos para mostrarle el horario de los talleres en su hora.</p>
      </div>
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-1 text-[15px] font-bold">Sobre usted (opcional)</legend>
        <p className="m-0 -mt-2 text-[15px] text-tinta-suave">Nos ayuda a preparar cursos pensados para quienes estudian. No es obligatorio y solo lo ve la academia.</p>
        <Campo nombre="areaLaboral" etiqueta="Área laboral" valorInicial={areaLaboral} autoComplete="organization-title" opcional
          error={estado?.campo === 'areaLaboral' ? estado.error : undefined} ayuda="Por ejemplo: docente de nivel inicial, madre o padre, cuidadora." />
        <Campo nombre="estudios" etiqueta="Estudios académicos" valorInicial={estudios} opcional
          error={estado?.campo === 'estudios' ? estado.error : undefined} ayuda="Por ejemplo: profesorado en educación inicial." />
      </fieldset>
      <div><BotonEnviar>Guardar cambios</BotonEnviar></div>
    </form>
  );
}

export function FormularioContrasena() {
  const [estado, accion] = useActionState<EstadoCuenta, FormData>(cambiarContrasena, undefined);
  const error = (campo: string) => (estado?.campo === campo ? estado.error : undefined);
  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <Campo nombre="actual" etiqueta="Contraseña actual" tipo="password" autoComplete="current-password" error={error('actual')} />
      <Campo nombre="nueva" etiqueta="Contraseña nueva" tipo="password" autoComplete="new-password" ayuda="Al menos 10 caracteres." error={error('nueva')} />
      <Campo nombre="repetir" etiqueta="Repita la contraseña nueva" tipo="password" autoComplete="new-password" error={error('repetir')} />
      <div><BotonEnviar>Cambiar contraseña</BotonEnviar></div>
    </form>
  );
}
