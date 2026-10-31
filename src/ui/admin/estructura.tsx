import Link from 'next/link';

export type Estado = 'borrador' | 'publicado' | 'archivado' | 'pendiente' | 'error';

const ESTADOS: Record<Estado, { texto: string; icono: string; clase: string }> = {
  borrador: { texto: 'Borrador', icono: '●', clase: 'bg-arena border-borde-bandeja text-marron' },
  publicado: { texto: 'Publicado', icono: '✓', clase: 'bg-salvia-claro border-[#93A68A] text-oliva-profundo' },
  archivado: { texto: 'Archivado', icono: '▢', clase: 'bg-[#ECE8E0] border-[#C9C2B5] text-tinta-suave' },
  pendiente: { texto: 'Pendiente', icono: '◐', clase: 'bg-[#F5EBCF] border-[#D9C48C] text-[#6B5420]' },
  error: { texto: 'Error', icono: '✕', clase: 'bg-[#F6E1D9] border-[#D9A592] text-error' },
};

/** Estado con color, ícono y palabra: nunca solo color. */
export function EstadoChip({ estado, texto }: { estado: Estado; texto?: string }) {
  const e = ESTADOS[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-0.5 text-[13px] font-bold ${e.clase}`}>
      <span aria-hidden="true">{e.icono}</span>
      {texto ?? e.texto}
    </span>
  );
}

export function CabeceraAdmin({ titulo, bajada, migas, acciones }: {
  titulo: string;
  bajada?: React.ReactNode;
  migas?: { href: string; texto: string }[];
  acciones?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-6">
      <div className="min-w-0">
        {migas && (
          <nav aria-label="Ubicación" className="mb-1.5 text-[14px] text-tinta-suave">
            {migas.map((m) => (
              <span key={m.href}><Link href={m.href} className="font-bold text-oliva-profundo no-underline hover:underline">{m.texto}</Link> › </span>
            ))}
          </nav>
        )}
        <h1 className="m-0 text-[clamp(30px,3.4vw,40px)] leading-[1.1]">{titulo}</h1>
        {bajada && <div className="mt-2 max-w-[46em] text-[16px] text-tinta-suave">{bajada}</div>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2.5">{acciones}</div>}
    </div>
  );
}

/**
 * Sección todavía no construida: explica qué tendrá y en qué entrega llega,
 * en lugar de mostrar botones deshabilitados sin contexto.
 */
export function EnPreparacion({ titulo, entrega, queHara, mientras }: {
  titulo: string;
  entrega: number;
  queHara: string[];
  mientras?: React.ReactNode;
}) {
  return (
    <>
      <CabeceraAdmin titulo={titulo} />
      <section aria-labelledby="en-preparacion" className="max-w-[760px] rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-[clamp(20px,3vw,28px)]">
        <div className="flex flex-wrap items-center gap-3">
          <EstadoChip estado="pendiente" texto="En preparación" />
          <p id="en-preparacion" className="m-0 font-bold">Llega en la entrega {entrega} de la Fase 5.</p>
        </div>
        <p className="m-0 mt-4">Esta sección va a permitirle:</p>
        <ul className="m-0 mt-2 flex flex-col gap-1.5 pl-5">
          {queHara.map((q) => <li key={q}>{q}</li>)}
        </ul>
        {mientras && <div className="mt-5 border-t border-borde-bandeja pt-4 text-[15px] text-tinta-suave">{mientras}</div>}
      </section>
    </>
  );
}
