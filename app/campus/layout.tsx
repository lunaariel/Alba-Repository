import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirSesion } from '@/datos/sesion';
import { configuracion } from '@/datos/publico';
import { Contenedor } from '@/ui/estructura';
import { IconoAlbor } from '@/ui/marca';
import { Navegacion } from '@/ui/menu';
import { salir } from '../(auth)/acciones';

// Datos de cada persona: nunca se guardan en caché.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'Campus', template: '%s · Campus · Albor' }, robots: { index: false } };

export default async function LayoutCampus({ children }: { children: React.ReactNode }) {
  await exigirSesion('/campus');
  const config = await configuracion();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-arena">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-marfil focus:p-3">
          Ir al contenido
        </a>
        <Contenedor className="flex items-center justify-between gap-x-8 py-[18px]">
          <Link href="/campus" className="flex items-center gap-3 font-display text-[22px] font-semibold text-marron no-underline">
            <IconoAlbor />
            <span>{config.nombre} <span className="font-texto text-base font-normal text-tinta-suave">· campus</span></span>
          </Link>
          <Navegacion
            etiqueta="Campus"
            enlaces={[
              { href: '/campus', texto: 'Mis cursos' },
              { href: '/campus/talleres', texto: 'Mis talleres' },
              { href: '/campus/compras', texto: 'Compras' },
              { href: '/campus/cuenta', texto: 'Cuenta' },
            ]}
            accion={
              <form action={salir}>
                <button type="submit" className="min-h-[44px] rounded-md border-2 border-oliva-profundo bg-marfil px-5 font-bold text-oliva-profundo">
                  Salir
                </button>
              </form>
            }
          />
        </Contenedor>
      </header>
      <main id="contenido" className="flex-1">{children}</main>
      <footer className="bg-marron text-marfil">
        <Contenedor className="flex flex-wrap justify-between gap-x-10 gap-y-4 py-8 text-base">
          <Link href="/" className="text-marfil">Volver al sitio</Link>
          <nav aria-label="Ayuda" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/contacto" className="text-marfil">Ayuda y contacto</Link>
            <Link href="/legales/terminos" className="text-marfil">Términos</Link>
            <Link href="/legales/privacidad" className="text-marfil">Privacidad</Link>
          </nav>
        </Contenedor>
      </footer>
    </div>
  );
}
