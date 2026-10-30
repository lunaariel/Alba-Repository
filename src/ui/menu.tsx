import Link from 'next/link';

export interface EnlaceMenu { href: string; texto: string; actual?: boolean }

/**
 * Navegación principal. En pantallas anchas, en línea; en móvil, un botón "Menú" que despliega
 * la lista (elemento <details>: funciona sin JavaScript y con teclado).
 */
export function Navegacion({ etiqueta, enlaces, accion }: { etiqueta: string; enlaces: EnlaceMenu[]; accion?: React.ReactNode }) {
  const enlace = (e: EnlaceMenu, clase: string) => (
    <Link key={e.href} href={e.href} aria-current={e.actual ? 'page' : undefined} className={clase}>
      {e.texto}
    </Link>
  );
  return (
    <>
      <nav aria-label={etiqueta} className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-[17px] md:flex">
        {enlaces.map((e) => enlace(e, 'rounded-sm px-3.5 py-2.5 text-marron no-underline hover:underline aria-[current=page]:font-bold aria-[current=page]:underline aria-[current=page]:underline-offset-[6px]'))}
        {accion && <div className="ml-2">{accion}</div>}
      </nav>
      <details className="group relative md:hidden">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-md border-2 border-oliva-profundo bg-marfil px-4 font-bold text-oliva-profundo [&::-webkit-details-marker]:hidden">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="group-open:hidden">
            <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="hidden group-open:block">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Menú
        </summary>
        <nav aria-label={etiqueta} className="absolute right-0 top-[calc(100%+8px)] z-20 flex w-[min(280px,calc(100vw-40px))] flex-col rounded-xl border-[1.5px] border-borde-bandeja bg-marfil p-2 shadow-flotante">
          {enlaces.map((e) => enlace(e, 'rounded-sm px-4 py-3 text-[17px] text-marron no-underline hover:bg-arena aria-[current=page]:font-bold'))}
          {accion && <div className="border-t border-borde-bandeja px-2 pb-1 pt-3">{accion}</div>}
        </nav>
      </details>
    </>
  );
}
