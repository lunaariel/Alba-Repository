import Link from 'next/link';
import { IconoAlbor } from './marca';
import { configuracion, hayRecursos } from '@/datos/publico';
import { enlaceWhatsApp } from '@/contenido/textos';
import { usuarioActual } from '@/datos/sesion';
import { Navegacion } from './menu';

/** Contenedor de sección: 1240px, margen lateral fluido (sistema de diseño: layout). */
export function Contenedor({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-[1240px] px-[clamp(20px,4vw,56px)] ${className}`}>{children}</div>;
}

export async function Encabezado() {
  const [config, recursos, sesion] = await Promise.all([configuracion(), hayRecursos(), usuarioActual()]);
  const enlaces = [
    { href: '/cursos', texto: 'Cursos' },
    { href: '/la-maestra', texto: 'La maestra' },
    { href: '/talleres', texto: 'Talleres' },
    ...(recursos ? [{ href: '/recursos', texto: 'Recursos' }] : []),
    { href: '/contacto', texto: 'Contacto' },
  ];
  return (
    <header className="bg-arena">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-marfil focus:p-3">
        Ir al contenido
      </a>
      <Contenedor className="flex items-center justify-between gap-x-8 gap-y-3 py-[18px]">
        <Link href="/" className="flex items-center gap-3 font-display text-[22px] font-semibold text-marron no-underline">
          <IconoAlbor />
          {config.nombre}
        </Link>
        <Navegacion
          etiqueta="Principal"
          enlaces={enlaces}
          accion={
            <Link href={sesion ? '/campus' : '/ingresar'} className="inline-flex min-h-[44px] items-center rounded-md border-2 border-oliva-profundo bg-marfil px-5 font-bold text-oliva-profundo no-underline">
              {sesion ? 'Mi campus' : 'Ingresar'}
            </Link>
          }
        />
      </Contenedor>
    </header>
  );
}

export async function Pie() {
  const config = await configuracion();
  const whatsapp = enlaceWhatsApp(config.whatsapp);
  return (
    <footer className="bg-marron text-marfil">
      <Contenedor className="flex flex-wrap justify-between gap-x-10 gap-y-5 py-10 text-base">
        <p className="m-0 flex items-center gap-2.5 font-display text-xl font-semibold">
          <IconoAlbor tamano={32} negativo />
          {config.nombre}
        </p>
        <nav aria-label="Legal y contacto" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/contacto" className="text-marfil">Contacto</Link>
          {whatsapp && <a href={whatsapp} className="text-marfil" rel="noopener">WhatsApp</a>}
          <Link href="/legales/terminos" className="text-marfil">Términos</Link>
          <Link href="/legales/privacidad" className="text-marfil">Privacidad</Link>
          <Link href="/legales/reembolsos" className="text-marfil">Reembolsos</Link>
        </nav>
      </Contenedor>
    </footer>
  );
}

/** Marco de foto provisoria: describe la toma hasta tener la fotografía real. */
export function MarcoFoto(props: { descripcion: string; alt: string; tinte?: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={props.alt}
      className={`flex items-end p-6 ${props.className ?? ''}`}
      style={{ background: props.tinte ?? '#E9DFC9' }}
    >
      <p className="m-0 text-[15px] leading-normal text-tinta-foto">{props.descripcion}</p>
    </div>
  );
}

/** Torre de piezas graduadas del hero (decorativa). */
export function Torre() {
  const piezas = [
    [22, '#4E6049'], [40, '#5D7358'], [58, '#6F856A'], [76, '#8A9E82'], [94, '#A7B79E'], [112, '#C2CDB9'],
  ] as const;
  return (
    <div aria-hidden="true" className="flex flex-col items-center">
      {piezas.map(([lado, color]) => (
        <span key={lado} className="block rounded-[3px]" style={{ width: lado, height: lado, background: color }} />
      ))}
    </div>
  );
}
