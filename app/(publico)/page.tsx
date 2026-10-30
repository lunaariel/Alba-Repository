import type { Metadata } from 'next';
import { configuracion, cursosPublicados, proximosTalleres } from '@/datos/publico';
import { filtrarCursos, filtroDesdeUrl } from '@/dominio/catalogo';
import { Contenedor, MarcoFoto, Torre } from '@/ui/estructura';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { ChipsFiltro, GrillaCursos } from '@/ui/cursos';
import { ListaTalleres } from '@/ui/talleres';
import { PreguntasFrecuentes } from '@/ui/contenido';


export const metadata: Metadata = {
  title: { absolute: 'Albor · Cursos Montessori para acompañar la primera infancia' },
  description: 'Cursos grabados y talleres en vivo de una maestra, para familias, docentes y cuidadores de niños de 0 a 6 años.',
  alternates: { canonical: '/' },
};

const PASOS = [
  { titulo: 'Elige un curso', texto: 'Ve el temario completo y el video de presentación antes de inscribirse.' },
  { titulo: 'Lo ve a su ritmo', texto: 'Videos cortos y materiales para descargar. El acceso no vence.' },
  { titulo: 'Lo lleva a su casa o aula', texto: 'Cada módulo termina con algo concreto para probar con los niños.' },
  { titulo: 'Obtiene su certificado', texto: 'Al completar todas las lecciones y aprobar la evaluación final.' },
];

export default async function Inicio({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  const [{ para }, config, cursos, talleres] = await Promise.all([searchParams, configuracion(), cursosPublicados(), proximosTalleres(3)]);
  const filtro = filtroDesdeUrl(para);
  const t = config.textos;

  const organizacion = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: config.nombre,
    url: process.env.NEXT_PUBLIC_URL_SITIO,
    logo: `${process.env.NEXT_PUBLIC_URL_SITIO}/marca/albor-emblema.svg`,
    ...(config.correoContacto ? { email: config.correoContacto } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizacion).replace(/</g, '\\u003c') }} />

      <section aria-labelledby="hero-titulo">
        <Contenedor className="flex flex-wrap items-end gap-x-[72px] gap-y-12 pt-[clamp(40px,6vw,88px)]">
          <div className="min-w-0 flex-[1_1_460px] pb-[clamp(24px,4vw,64px)]">
            <h1 id="hero-titulo" className="m-0 max-w-[11em] text-[clamp(40px,5vw,70px)] leading-[1.06] tracking-[-0.015em]">
              {t.heroTitulo}
            </h1>
            <p className="m-0 mt-7 max-w-[32em] text-xl">{t.heroBajada}</p>
            <div className="mt-9 flex flex-wrap gap-3.5">
              <EnlaceBoton href={cursos.length ? '#cursos' : '/talleres'}>{cursos.length ? 'Ver los cursos' : 'Ver los talleres'}</EnlaceBoton>
              <EnlaceAccion href="#como">Cómo funciona</EnlaceAccion>
            </div>
          </div>
          <figure className="m-0 min-w-0 flex-[1_1_420px]">
            <div className="flex items-end justify-center gap-[clamp(20px,4vw,56px)] px-6">
              <Torre />
              <MarcoFoto
                className="aspect-[3/4] w-[clamp(200px,22vw,300px)] rounded-2xl"
                alt="Espacio para fotografía cenital de una bandeja con materiales"
                descripcion="Foto cenital: bandeja de madera con una jarra pequeña y dos vasos, sobre mantel de lino."
              />
            </div>
          </figure>
        </Contenedor>
      </section>

      <section id="cursos" aria-labelledby="cursos-titulo" className="mt-[clamp(48px,6vw,80px)] bg-arena">
        <Contenedor className="py-[clamp(56px,7vw,96px)]">
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
            <div className="max-w-[560px]">
              <h2 id="cursos-titulo" className="m-0 text-[clamp(32px,3.4vw,46px)] leading-[1.15]">Los cursos</h2>
              <p className="m-0 mt-3.5">
                {cursos.length ? 'Elija según su rol o la edad del niño que acompaña.' : 'Los primeros cursos se publican pronto.'}
              </p>
            </div>
            {cursos.length > 0 && <ChipsFiltro actual={filtro} ruta="/" ancla="#cursos" />}
          </div>
          <div className="mt-12">
            {cursos.length > 0 ? (
              <GrillaCursos cursos={filtrarCursos(cursos, filtro)} filtro={filtro} ruta="/#cursos" />
            ) : (
              <div className="rounded-2xl bg-marfil px-6 py-12 text-center">
                <p className="m-0 text-[19px]">Todavía no hay cursos publicados.</p>
                <div className="mt-4"><EnlaceBoton href="/contacto" variante="secundario" tamano="compacto">Quiero recibir el aviso</EnlaceBoton></div>
              </div>
            )}
          </div>
        </Contenedor>
      </section>

      <section id="como" aria-labelledby="como-titulo">
        <Contenedor className="py-[clamp(56px,7vw,104px)]">
          <h2 id="como-titulo" className="m-0 text-[clamp(32px,3.4vw,46px)]">Cómo es aprender aquí</h2>
          <ol className="m-0 mt-10 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-8 p-0">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="flex flex-col gap-2.5">
                <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-full bg-salvia font-display text-[22px] font-semibold">
                  {i + 1}
                </span>
                <h3 className="m-0 font-texto text-xl font-bold">{p.titulo}</h3>
                <p className="m-0 text-base">{p.texto}</p>
              </li>
            ))}
          </ol>
        </Contenedor>
      </section>

      <section aria-labelledby="maestra-titulo">
        <Contenedor className="pb-[clamp(56px,7vw,104px)]">
          <div className="flex flex-wrap items-center gap-x-14 gap-y-8 rounded-3xl bg-salvia p-[clamp(24px,4vw,56px)]">
            <MarcoFoto
              className="aspect-square flex-[0_1_320px] rounded-2xl"
              alt="Espacio para retrato de la maestra"
              descripcion="Retrato de la maestra sentada a la altura de un estante bajo, sonriendo, luz suave."
            />
            <div className="min-w-0 flex-[1_1_380px]">
              <h2 id="maestra-titulo" className="m-0 text-[clamp(30px,3vw,42px)]">Quién prepara cada curso</h2>
              <p className="m-0 mt-4 text-[19px]">{t.maestraNombre}. {t.maestraResumen}</p>
              <p className="m-0 mt-3.5 text-[19px]">{t.maestraFrase}</p>
              <div className="mt-6"><EnlaceBoton href="/la-maestra" variante="claro">Conocer su historia</EnlaceBoton></div>
            </div>
          </div>
        </Contenedor>
      </section>

      {talleres.length > 0 && (
        <section aria-labelledby="talleres-titulo" className="bg-arena">
          <Contenedor className="flex flex-wrap gap-x-[72px] gap-y-8 py-[clamp(56px,7vw,96px)]">
            <div className="max-w-[420px] flex-[1_1_300px]">
              <h2 id="talleres-titulo" className="m-0 text-[clamp(30px,3vw,42px)]">Talleres en vivo</h2>
              <p className="m-0 mt-3.5">Encuentros por videollamada para hacer preguntas y practicar juntos. Los horarios se muestran en hora de Guatemala.</p>
            </div>
            <div className="min-w-0 flex-[2_1_480px]"><ListaTalleres talleres={talleres} /></div>
          </Contenedor>
        </section>
      )}

      <section aria-labelledby="preguntas-titulo">
        <div className="mx-auto max-w-[860px] px-[clamp(20px,4vw,56px)] py-[clamp(56px,7vw,96px)]">
          <h2 id="preguntas-titulo" className="m-0 mb-7 text-[clamp(30px,3vw,42px)]">Preguntas frecuentes</h2>
          <PreguntasFrecuentes preguntas={t.preguntas} />
        </div>
      </section>
    </>
  );
}
