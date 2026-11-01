import type { Metadata } from 'next';
import Link from 'next/link';
import { configuracion } from '@/datos/publico';
import { exigirAdmin } from '@/datos/sesion';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';
import { FormPresentacion } from './FormPresentacion';

export const metadata: Metadata = { title: 'Contenido' };

/** Textos institucionales. Por ahora, la presentación de la maestra (con aprobación antes de publicar). */
export default async function Contenido() {
  await exigirAdmin();
  const { textos: t } = await configuracion();
  return (
    <>
      <CabeceraAdmin titulo="Contenido" bajada="Textos del sitio. Los artículos del blog y las páginas legales llegan en una entrega próxima." />
      <div className="grid max-w-[1100px] grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_380px]">
        <section aria-labelledby="presentacion" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="presentacion" className="m-0 text-[22px]">Presentación de la maestra</h2>
            <EstadoChip estado={t.presentacionAprobada ? 'publicado' : 'borrador'} texto={t.presentacionAprobada ? 'Aprobada y publicada' : 'Pendiente de revisión'} />
          </div>
          <p className="m-0 mt-1 mb-5 text-[15px] text-tinta-suave">
            Se muestra en <Link href="/la-maestra" className="font-bold text-oliva-profundo">La maestra</Link>. La trayectoria inicial es la que informó la titular; revísela antes de aprobar.
          </p>
          <FormPresentacion p={{
            maestraNombre: t.maestraNombre, maestraLema: t.maestraLema, maestraResumen: t.maestraResumen, maestraFrase: t.maestraFrase,
            maestraHistoria: t.maestraHistoria, trayectoria: t.maestraTrayectoria.join('\n'), aprobada: t.presentacionAprobada,
          }} />
        </section>
        <aside aria-labelledby="previa" className="rounded-2xl bg-arena p-6">
          <h2 id="previa" className="m-0 text-[20px]">Vista previa</h2>
          <p className="m-0 mt-3 text-[14px] font-bold uppercase tracking-wide text-oliva-profundo">{t.maestraLema}</p>
          <p className="m-0 mt-1 font-display text-[26px] leading-tight">{t.maestraNombre}</p>
          <p className="m-0 mt-2 text-[15px]">{t.maestraResumen}</p>
          <h3 className="m-0 mt-4 text-[17px]">Formación y trayectoria</h3>
          <ul className="m-0 mt-2 list-disc pl-5 text-[15px]">{t.maestraTrayectoria.map((x) => <li key={x}>{x}</li>)}</ul>
          {!t.presentacionAprobada && <p className="m-0 mt-4 text-[14px] text-tinta-suave">Todavía no se publica: falta su aprobación.</p>}
        </aside>
      </div>
    </>
  );
}
