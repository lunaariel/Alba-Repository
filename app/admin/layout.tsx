import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirAdmin } from '@/datos/sesion';
import { configuracion } from '@/datos/publico';
import { clienteSesion } from '@/datos/supabase';
import { IconoAlbor } from '@/ui/marca';
import { MenuAdmin } from '@/ui/admin/MenuAdmin';
import { salir } from '../(auth)/acciones';

// Nunca en caché y nunca en buscadores. Quien no es admin recibe "no encontrado".
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel · Albor' },
  robots: { index: false, follow: false },
};

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const usuario = await exigirAdmin();
  const [config, { data: perfil }] = await Promise.all([
    configuracion(),
    (await clienteSesion()).from('perfiles').select('nombre_completo').eq('id', usuario.id).maybeSingle(),
  ]);
  const pie = (
    <div className="flex flex-col gap-1 text-[14px]">
      <p className="m-0 font-bold">{perfil?.nombre_completo ?? usuario.email}</p>
      <p className="m-0 text-tinta-suave">Administradora</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/" className="font-bold text-oliva-profundo">Ver el sitio</Link>
        <Link href="/campus" className="font-bold text-oliva-profundo">Campus</Link>
        <form action={salir}>
          <button type="submit" className="min-h-[36px] font-bold text-oliva-profundo underline underline-offset-4">Salir</button>
        </form>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:bg-marfil focus:p-3">
        Ir al contenido
      </a>
      <aside className="flex items-center justify-between gap-4 bg-arena px-[clamp(20px,4vw,24px)] py-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto lg:px-4 lg:py-6">
        <Link href="/admin" className="flex items-center gap-2.5 px-2 font-display text-[22px] font-semibold text-marron no-underline lg:pb-2">
          <IconoAlbor tamano={36} />
          <span>{config.nombre} <span className="font-texto text-[14px] font-normal text-tinta-suave">· panel</span></span>
        </Link>
        <MenuAdmin pie={pie} />
      </aside>
      <main id="contenido" className="min-w-0 px-[clamp(20px,4vw,48px)] pb-16 pt-[clamp(24px,3.5vw,40px)]">{children}</main>
    </div>
  );
}
