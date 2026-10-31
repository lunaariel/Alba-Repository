'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const SECCIONES_ADMIN = [
  { grupo: 'Trabajo diario', enlaces: [
    { href: '/admin', texto: 'Hoy' },
    { href: '/admin/cursos', texto: 'Cursos' },
    { href: '/admin/talleres', texto: 'Talleres' },
    { href: '/admin/alumnos', texto: 'Alumnos' },
    { href: '/admin/certificados', texto: 'Certificados' },
  ] },
  { grupo: 'Administración', enlaces: [
    { href: '/admin/ventas', texto: 'Ventas' },
    { href: '/admin/contenido', texto: 'Contenido' },
    { href: '/admin/comunicaciones', texto: 'Comunicaciones' },
    { href: '/admin/configuracion', texto: 'Configuración' },
  ] },
] as const;

function activo(ruta: string, href: string) {
  return href === '/admin' ? ruta === '/admin' : ruta === href || ruta.startsWith(`${href}/`);
}

function Lista({ ruta }: { ruta: string }) {
  return (
    <>
      {SECCIONES_ADMIN.map((g) => (
        <div key={g.grupo}>
          <p className="m-0 px-3 pb-1.5 pt-4 text-[12px] font-bold uppercase tracking-[0.08em] text-tinta-suave">{g.grupo}</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {g.enlaces.map((e) => (
              <li key={e.href}>
                <Link
                  href={e.href}
                  aria-current={activo(ruta, e.href) ? 'page' : undefined}
                  className="flex min-h-[44px] items-center rounded-sm px-3 text-[16px] text-marron no-underline hover:bg-marfil aria-[current=page]:bg-blanco-calido aria-[current=page]:font-bold aria-[current=page]:shadow-[inset_3px_0_0_#4E6049]"
                >
                  {e.texto}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** Menú lateral fijo en pantallas anchas; botón "Menú" desplegable en el celular. */
export function MenuAdmin({ pie }: { pie: React.ReactNode }) {
  const ruta = usePathname();
  return (
    <>
      <nav aria-label="Panel" className="hidden lg:block">
        <Lista ruta={ruta} />
        <div className="mt-6 border-t border-borde-bandeja px-3 pt-4">{pie}</div>
      </nav>
      <details className="group relative lg:hidden" key={ruta}>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-md border-2 border-oliva-profundo bg-marfil px-4 font-bold text-oliva-profundo [&::-webkit-details-marker]:hidden">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="group-open:hidden">
            <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="hidden group-open:block">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Menú
        </summary>
        <nav aria-label="Panel" className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(300px,calc(100vw-40px))] rounded-xl border-[1.5px] border-borde-bandeja bg-arena p-2 shadow-flotante">
          <Lista ruta={ruta} />
          <div className="mt-3 border-t border-borde-bandeja px-3 pb-1 pt-3">{pie}</div>
        </nav>
      </details>
    </>
  );
}
