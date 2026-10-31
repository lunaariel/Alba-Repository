import type { Metadata } from 'next';
import { configuracion } from '@/datos/publico';
import { esPendiente } from '@/contenido/textos';
import { Contenedor, MarcoFoto } from '@/ui/estructura';
import { EnlaceBoton } from '@/ui/acciones';
import { Parrafos } from '@/ui/contenido';

export async function generateMetadata(): Promise<Metadata> {
  const { textos } = await configuracion();
  return {
    title: 'La maestra',
    description: 'Quién prepara cada curso de Albor: su historia, su experiencia en el aula y su forma de enseñar.',
    alternates: { canonical: '/la-maestra' },
    // Mientras la biografía sea un marcador pendiente, la página no se indexa.
    robots: esPendiente(textos.maestraHistoria) ? { index: false } : undefined,
  };
}

export default async function LaMaestra() {
  const { textos: t } = await configuracion();
  return (
    <>
      <section aria-labelledby="titulo">
        <Contenedor className="flex flex-wrap items-center gap-x-16 gap-y-10 py-[clamp(40px,6vw,88px)]">
          <MarcoFoto
            className="aspect-[4/5] flex-[0_1_420px] rounded-2xl"
            alt="Espacio para fotografía real de la maestra"
            descripcion="Foto real de la maestra en su aula o en casa, con luz natural de ventana lateral. Sin niños identificables."
          />
          <div className="min-w-0 flex-[1_1_420px]">
            {t.presentacionAprobada && <p className="m-0 mb-3 text-[15px] font-bold uppercase tracking-wide text-oliva-profundo">{t.maestraLema}</p>}
            <h1 id="titulo" className="m-0 text-[clamp(36px,4.2vw,58px)] leading-[1.08]">{t.maestraNombre}</h1>
            <p className="m-0 mt-5 text-xl">{t.maestraResumen}</p>
            <blockquote className="m-0 mt-7 border-0 font-display text-[clamp(24px,2.4vw,32px)] leading-snug">{t.maestraFrase}</blockquote>
          </div>
        </Contenedor>
      </section>
      <section aria-labelledby="historia" className="bg-arena">
        <div className="mx-auto max-w-[860px] px-[clamp(20px,4vw,56px)] py-[clamp(56px,7vw,96px)]">
          <h2 id="historia" className="m-0 text-[clamp(30px,3vw,42px)]">Su historia</h2>
          <div className="mt-6 flex max-w-[34em] flex-col gap-5 text-lg"><Parrafos texto={t.maestraHistoria} /></div>
          {t.presentacionAprobada && t.maestraTrayectoria.length > 0 && (
            <>
              <h2 className="m-0 mt-12 text-[clamp(26px,2.6vw,34px)]">Formación y trayectoria</h2>
              <ul className="m-0 mt-5 flex max-w-[34em] list-disc flex-col gap-2 pl-6 text-lg">
                {t.maestraTrayectoria.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </>
          )}
          <div className="mt-10"><EnlaceBoton href="/cursos">Ver los cursos</EnlaceBoton></div>
        </div>
      </section>
    </>
  );
}
