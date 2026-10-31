'use client';

import { useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

const estilos = {
  primario: 'min-h-[44px] rounded-sm bg-oliva-profundo px-[18px] font-bold text-marfil hover:bg-marron',
  secundario: 'min-h-[44px] rounded-sm border-2 border-oliva-profundo bg-blanco-calido px-[18px] font-bold text-oliva-profundo hover:bg-arena',
  peligro: 'min-h-[44px] rounded-sm border-2 border-error bg-blanco-calido px-[18px] font-bold text-error hover:bg-[#F6E1D9]',
  enlace: 'min-h-[40px] px-1 font-bold text-oliva-profundo underline underline-offset-4',
  enlacePeligro: 'min-h-[40px] px-1 font-bold text-error underline underline-offset-4',
};

function Enviar({ texto, peligro, habilitado }: { texto: string; peligro: boolean; habilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!habilitado || pending}
      className={`min-h-[46px] rounded-md px-5 font-bold text-marfil disabled:opacity-50 ${peligro ? 'bg-error' : 'bg-oliva-profundo hover:bg-marron'}`}
    >
      {pending ? 'Un momento…' : texto}
    </button>
  );
}

/**
 * Botón que abre una confirmación antes de ejecutar una acción del servidor.
 * Con `palabra`, hay que escribirla para habilitar el botón (el servidor también la verifica).
 */
export function ConfirmarAccion(props: {
  accion: (datos: FormData) => void | Promise<void>;
  campos: Record<string, string>;
  textoBoton: string;
  titulo: string;
  children: React.ReactNode;
  textoConfirmar?: string;
  palabra?: string;
  peligro?: boolean;
  estilo?: keyof typeof estilos;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [escrito, setEscrito] = useState('');
  const id = useId();
  const habilitado = !props.palabra || escrito.trim().toUpperCase() === props.palabra;
  return (
    <>
      <button type="button" onClick={() => { setEscrito(''); dialogo.current?.showModal(); }} className={estilos[props.estilo ?? 'secundario']}>
        {props.textoBoton}
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={`${id}-t`}
        className="m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl border-0 bg-blanco-calido p-0 text-marron shadow-flotante backdrop:bg-[rgba(68,61,52,0.42)]"
      >
        <form action={props.accion} className="flex flex-col gap-4 p-[clamp(20px,4vw,28px)]">
          {Object.entries(props.campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <h2 id={`${id}-t`} className="m-0 text-[24px] leading-tight">{props.titulo}</h2>
          <div className="flex flex-col gap-2 text-[16px]">{props.children}</div>
          {props.palabra && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-p`} className="text-[15px] font-bold">Escriba {props.palabra} para confirmar</label>
              <input
                id={`${id}-p`} name="confirmacion" autoComplete="off" value={escrito} onChange={(e) => setEscrito(e.target.value)}
                className="min-h-[50px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 uppercase text-marron"
              />
            </div>
          )}
          <div className="mt-1 flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => dialogo.current?.close()} className="min-h-[46px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-5 font-bold text-oliva-profundo">
              Volver sin cambios
            </button>
            <Enviar texto={props.textoConfirmar ?? props.textoBoton} peligro={Boolean(props.peligro)} habilitado={habilitado} />
          </div>
        </form>
      </dialog>
    </>
  );
}
