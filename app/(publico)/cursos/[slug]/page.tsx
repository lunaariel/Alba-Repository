import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { configuracion, cursoPorSlug } from '@/datos/publico';
import { etiquetaDuracion, metadatosCurso } from '@/dominio/catalogo';
import { formatearUSD } from '@/dominio/dinero';
import { BIBLIOTECA_VIDEO_PUBLICA, INSCRIPCIONES_ABIERTAS } from '@/config/comercio';
import { Contenedor, MarcoFoto } from '@/ui/estructura';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { Parrafos } from '@/ui/contenido';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const curso = await cursoPorSlug((await params).slug);
  if (!curso) return { title: 'Curso no encontrado' };
  return {
    title: curso.titulo,
    description: curso.resumen ?? undefined,
    alternates: { canonical: `/cursos/${curso.slug}` },
  };
}

export default async function FichaCurso({ params }: Props) {
  const [curso, config] = await Promise.all([cursoPorSlug((await params).slug), configuracion()]);
  if (!curso) notFound();

  const lecciones = curso.modulos.reduce((n, m) => n + m.lecciones.length, 0);
  const datosEstructurados = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: curso.titulo,
    description: curso.resumen ?? curso.titulo,
    inLanguage: 'es',
    provider: { '@type': 'EducationalOrganization', name: config.nombre },
    offers: { '@type': 'Offer', price: (curso.precioCentavos / 100).toFixed(2), priceCurrency: 'USD', category: 'Paid' },
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datosEstructurados).replace(/</g, '\\u003c') }} />

      <section aria-labelledby="titulo">
        <Contenedor className="flex flex-wrap gap-x-16 gap-y-10 py-[clamp(40px,6vw,88px)]">
          <div className="min-w-0 flex-[1_1_480px]">
            <p className="m-0 text-[15px] text-tinta-suave">{metadatosCurso(curso)}</p>
            <h1 id="titulo" className="m-0 mt-3 text-[clamp(36px,4.2vw,58px)] leading-[1.08]">{curso.titulo}</h1>
            {curso.resumen && <p className="m-0 mt-5 max-w-[34em] text-xl">{curso.resumen}</p>}
            <div className="mt-8 overflow-hidden rounded-2xl">
              {curso.videoPresentacionId && BIBLIOTECA_VIDEO_PUBLICA ? (
                <div className="relative aspect-video">
                  <iframe
                    src={`https://iframe.mediadelivery.net/embed/${BIBLIOTECA_VIDEO_PUBLICA}/${curso.videoPresentacionId}?autoplay=false`}
                    title={`Video de presentación: ${curso.titulo}`}
                    loading="lazy"
                    allow="encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 size-full border-0"
                  />
                </div>
              ) : (
                <MarcoFoto className="aspect-video" tinte="#C2CDB9" alt="Espacio para el video de presentación del curso" descripcion="Video de presentación pendiente." />
              )}
            </div>
          </div>

          <aside aria-label="Inscripción" className="h-fit flex-[0_1_360px] rounded-2xl border-[1.5px] border-borde-bandeja bg-arena p-7">
            <p className="m-0 font-display text-[40px] font-semibold leading-none">{formatearUSD(curso.precioCentavos)}</p>
            <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0 text-base">
              <li>{lecciones} {lecciones === 1 ? 'lección' : 'lecciones'} en video{curso.duracionMinutos ? `, ${etiquetaDuracion(curso.duracionMinutos)} en total` : ''}</li>
              {curso.cantidadMateriales > 0 && <li>{curso.cantidadMateriales} {curso.cantidadMateriales === 1 ? 'material descargable' : 'materiales descargables'} en PDF</li>}
              <li>Acceso sin vencimiento</li>
              {curso.tieneEvaluacion && <li>Evaluación final y certificado de finalización</li>}
            </ul>
            <div className="mt-6">
              {INSCRIPCIONES_ABIERTAS ? (
                <EnlaceBoton href={`/cursos/${curso.slug}/inscribirme`}>Inscribirme</EnlaceBoton>
              ) : (
                <>
                  <p className="m-0 font-bold text-oliva-profundo">Las inscripciones abren pronto.</p>
                  <div className="mt-3"><EnlaceAccion href="/contacto">Quiero recibir el aviso</EnlaceAccion></div>
                </>
              )}
            </div>
          </aside>
        </Contenedor>
      </section>

      <section aria-labelledby="sobre" className="bg-arena">
        <div className="mx-auto flex max-w-[860px] flex-col gap-12 px-[clamp(20px,4vw,56px)] py-[clamp(56px,7vw,96px)]">
          {curso.descripcion && (
            <div>
              <h2 id="sobre" className="m-0 text-[clamp(30px,3vw,42px)]">Sobre el curso</h2>
              <div className="mt-5 flex flex-col gap-4 text-lg"><Parrafos texto={curso.descripcion} /></div>
            </div>
          )}
          {curso.objetivos.length > 0 && (
            <div>
              <h2 className="m-0 text-[clamp(28px,2.6vw,36px)]">Qué va a aprender</h2>
              <ul className="m-0 mt-5 flex list-disc flex-col gap-2 pl-6 text-lg">
                {curso.objetivos.map((o) => <li key={o}>{o}</li>)}
              </ul>
            </div>
          )}
          <div>
            <h2 className="m-0 text-[clamp(28px,2.6vw,36px)]">Temario</h2>
            <ol className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
              {curso.modulos.map((m, i) => (
                <li key={m.titulo}>
                  <details className="rounded-lg bg-marfil px-[22px] py-[18px]" open={i === 0}>
                    <summary className="cursor-pointer text-lg font-bold">Módulo {i + 1}: {m.titulo}</summary>
                    <ol className="m-0 mt-3 flex list-decimal flex-col gap-1.5 pl-6">
                      {m.lecciones.map((l) => (
                        <li key={l.titulo}>{l.titulo}{l.duracionMinutos ? <span className="text-tinta-suave"> · {etiquetaDuracion(l.duracionMinutos)}</span> : null}</li>
                      ))}
                    </ol>
                  </details>
                </li>
              ))}
            </ol>
          </div>
          {curso.requisitos && (
            <div>
              <h2 className="m-0 text-[clamp(28px,2.6vw,36px)]">Requisitos previos</h2>
              <div className="mt-4 text-lg"><Parrafos texto={curso.requisitos} /></div>
            </div>
          )}
          <div>
            <h2 className="m-0 text-[clamp(28px,2.6vw,36px)]">Certificado</h2>
            <p className="m-0 mt-4 text-lg">
              Al completar todas las lecciones y aprobar la evaluación final recibe un certificado de finalización emitido por {config.nombre}.
              No es una acreditación Montessori oficial.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
