import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoCampus, leccionCampus, registrarVisita } from '@/datos/campus';
import { exigirSesion } from '@/datos/sesion';
import { vecinas } from '@/dominio/aprendizaje';
import { Contenedor } from '@/ui/estructura';
import { Marca, TemarioCampus } from '@/ui/campus';
import { Parrafos } from '@/ui/contenido';
import { Aviso } from '@/ui/Formulario';
import { marcarLeccion } from '../../../../acciones';

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const curso = await cursoCampus(slug);
  return { title: curso?.lecciones.find((l) => l.id === id)?.titulo ?? 'Lección' };
}

export default async function Leccion({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const { aviso } = await searchParams;
  const usuario = await exigirSesion(`/campus/cursos/${slug}/lecciones/${id}`);
  const curso = await cursoCampus(slug);
  if (!curso) notFound();
  const detalle = await leccionCampus(curso, id, usuario.id);
  if (!detalle) notFound();
  await registrarVisita(usuario.id, id);

  const { leccion, descripcion, video } = detalle;
  const { anterior, siguiente, posicion, total } = vecinas(curso.lecciones, id);
  const materiales = curso.materiales.filter((m) => m.leccionId === id);
  const base = `/campus/cursos/${slug}`;

  return (
    <Contenedor className="flex flex-wrap gap-x-12 gap-y-10 pb-20 pt-[clamp(24px,4vw,44px)]">
      <article className="min-w-0 flex-[1_1_600px]" aria-labelledby="titulo-leccion">
        <Link href={base} className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-bold text-oliva-profundo no-underline hover:underline">
          <span aria-hidden="true">←</span> {curso.titulo}
        </Link>
        <p className="m-0 mt-2 text-[15px] text-tinta-suave">Lección {posicion} de {total} · {leccion.moduloTitulo}</p>
        <h1 id="titulo-leccion" className="m-0 mt-1 text-[clamp(30px,3.6vw,46px)] leading-[1.1]">{leccion.titulo}</h1>

        <div className="mt-6 aspect-video w-full overflow-hidden rounded-2xl bg-salvia-claro">
          {video.estado === 'listo' ? (
            <iframe
              src={video.url}
              title={`Video: ${leccion.titulo}`}
              loading="lazy"
              allow="accelerometer; gyroscope; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-end p-6">
              <p className="m-0 text-[15px] text-tinta-foto" data-estado-video={video.estado}>
                {video.estado === 'error'
                  ? 'No pudimos cargar el video en este momento. Recargue la página en unos minutos.'
                  : video.estado === 'no_disponible'
                    ? 'El video de esta lección no está disponible para su acceso.'
                    : 'Video de la lección pendiente: se verá aquí cuando la maestra lo cargue.'}
              </p>
            </div>
          )}
        </div>

        {aviso === 'error' && <div className="mt-6"><Aviso tipo="error">No pudimos guardar su avance. Intente de nuevo.</Aviso></div>}

        <form action={marcarLeccion} className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-arena p-5">
          <input type="hidden" name="curso" value={slug} />
          <input type="hidden" name="leccion" value={id} />
          {leccion.completada ? (
            <>
              <p className="m-0 flex items-center gap-2 font-bold text-oliva-profundo"><Marca hecha /> Lección completada</p>
              <input type="hidden" name="completada" value="no" />
              <button type="submit" className="min-h-[44px] font-bold text-oliva-profundo underline underline-offset-4">Desmarcar</button>
              {siguiente && (
                <Link href={`${base}/lecciones/${siguiente.id}`} className="ml-auto inline-flex min-h-[44px] items-center rounded-sm bg-oliva-profundo px-[18px] font-bold text-marfil no-underline hover:bg-marron">
                  Siguiente lección
                </Link>
              )}
            </>
          ) : (
            <>
              <input type="hidden" name="completada" value="si" />
              <input type="hidden" name="siguiente" value={siguiente?.id ?? ''} />
              <p className="m-0 flex-[1_1_240px] text-[15px]">Cuando termine de ver la lección y revisar los materiales, márquela como completada.</p>
              <button type="submit" className="min-h-[54px] rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil hover:bg-marron">
                {siguiente ? 'Completar y seguir' : 'Completar lección'}
              </button>
            </>
          )}
        </form>

        {descripcion && <div className="mt-8 flex max-w-[40em] flex-col gap-4 text-lg"><Parrafos texto={descripcion} /></div>}

        {materiales.length > 0 && (
          <section aria-labelledby="materiales" className="mt-8">
            <h2 id="materiales" className="m-0 mb-3 text-[22px]">Materiales de esta lección</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {materiales.map((m) => (
                <li key={m.id}><a href={`/campus/materiales/${m.id}`} className="font-bold text-oliva-profundo underline underline-offset-4">{m.titulo} (PDF)</a></li>
              ))}
            </ul>
          </section>
        )}

        <nav aria-label="Lecciones" className="mt-10 flex flex-wrap justify-between gap-4 border-t border-borde-bandeja pt-5">
          {anterior ? <Link href={`${base}/lecciones/${anterior.id}`} className="font-bold text-oliva-profundo">← {anterior.titulo}</Link> : <span />}
          {siguiente && <Link href={`${base}/lecciones/${siguiente.id}`} className="font-bold text-oliva-profundo">{siguiente.titulo} →</Link>}
        </nav>
      </article>

      <aside aria-label="Temario del curso" className="min-w-0 flex-[0_1_360px]">
        <h2 className="m-0 mb-4 text-[22px]">Temario</h2>
        <TemarioCampus slug={slug} lecciones={curso.lecciones} actual={id} />
      </aside>
    </Contenedor>
  );
}
