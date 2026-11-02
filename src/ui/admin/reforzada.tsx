'use client';

import { createContext, useContext, useId } from 'react';

/**
 * Verificación reforzada en el panel: con la política de segundo factor encendida, las operaciones de mayor
 * impacto piden el código actual de la app autenticadora. El campo es solo la entrada: el servidor lo verifica
 * con Supabase Auth y la base comprueba que la verificación sea reciente y de un solo uso. Sin la política,
 * el campo no aparece y nada cambia.
 */
const Politica = createContext<{ activa: boolean; minutos: number }>({ activa: false, minutos: 5 });

export function PoliticaReforzada({ activa, minutos, children }: { activa: boolean; minutos: number; children: React.ReactNode }) {
  return <Politica.Provider value={{ activa, minutos }}>{children}</Politica.Provider>;
}

export function useReforzadaActiva() {
  return useContext(Politica).activa;
}

/** Campo «código de su app autenticadora» para formularios de operaciones sensibles. */
export function CampoCodigoReforzado({ onCambio, cuando }: { onCambio?: (valor: string) => void; cuando?: string }) {
  const { activa } = useContext(Politica);
  const id = useId();
  if (!activa) return null;
  return (
    <div className="flex flex-col gap-1.5" data-reforzada>
      <label htmlFor={`${id}-codigo`} className="text-[15px] font-bold">Código de su app autenticadora</label>
      <input
        id={`${id}-codigo`} name="codigo_reforzado" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required={!cuando}
        onChange={(e) => onCambio?.(e.target.value)}
        aria-describedby={`${id}-ayuda`}
        className="min-h-[50px] max-w-[220px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 tracking-[0.2em] text-marron"
      />
      <p id={`${id}-ayuda`} className="m-0 text-[14px] text-tinta-suave">
        {cuando ? `Solo hace falta ${cuando}. ` : 'Operación sensible: se verifica su identidad en este momento. '}Cada código sirve para una sola operación.
      </p>
    </div>
  );
}
