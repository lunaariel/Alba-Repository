'use client';

import { useFormStatus } from 'react-dom';

/** Campo con etiqueta y error asociados (sistema de diseño: formularios accesibles). */
export function Campo(props: {
  nombre: string;
  etiqueta: string;
  tipo?: string;
  autoComplete?: string;
  error?: string;
  ayuda?: string;
}) {
  const idError = `${props.nombre}-error`;
  const idAyuda = `${props.nombre}-ayuda`;
  const describe = [props.error ? idError : null, props.ayuda ? idAyuda : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.nombre} className="text-[15px] font-bold">{props.etiqueta}</label>
      <input
        id={props.nombre}
        name={props.nombre}
        type={props.tipo ?? 'text'}
        autoComplete={props.autoComplete}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describe}
        className={`min-h-[52px] rounded-md border-[1.5px] bg-blanco-calido px-4 text-marron ${props.error ? 'border-error' : 'border-borde-control'}`}
      />
      {props.ayuda && <p id={idAyuda} className="m-0 text-[15px] text-tinta-suave">{props.ayuda}</p>}
      {props.error && <p id={idError} className="m-0 text-[15px] text-error">{props.error}</p>}
    </div>
  );
}

export function BotonEnviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[54px] rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil transition-colors hover:bg-marron disabled:opacity-55"
    >
      {pending ? 'Un momento…' : children}
    </button>
  );
}

export function Aviso({ tipo, children }: { tipo: 'error' | 'ok'; children: React.ReactNode }) {
  return (
    <p role={tipo === 'error' ? 'alert' : 'status'} className={`m-0 rounded-lg p-4 ${tipo === 'error' ? 'bg-arena text-error' : 'bg-arena text-marron'}`}>
      {children}
    </p>
  );
}
