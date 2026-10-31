import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cambioDeVersion, cursoCampus } from '@/datos/campus';
import { estadoCertificado, textoAvance } from '@/dominio/aprendizaje';
import { Contenedor } from '@/ui/estructura';
import { BarraAvance, EncabezadoCampus, TemarioCampus } from '@/ui/campus';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { Aviso } from '@/ui/Formulario';
import { obtenerCertificado } from '../../acciones';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const curso = await cursoCampus((await params).slug);
  return { title: curso?.titulo ?? 'Curso' };
}

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Tarjeta({ titulo, id, children }: { titulo: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={titulo} className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <h2 className="m-0 mb-3 text-[22px]">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function CursoCampus({ params, searchParams }: Props) {
  const { slug } = await params;
  const { aviso } = await searchParams;
  const curso = await cursoCampus(slug);
  if (!curso) notFound();

  const hechas = curso.lecciones.length - curso.pendientes;
  const ev = curso.evaluacion;
  const aprobada = Boolean(ev?.aprobada);
  const cambio = await cambioDeVersion(curso.id);
  const fechaVersion = (d: Date) => new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'America/Guatemala' }).format(d);
  const sinIntentos = ev?.intentosPermitidos != null && ev.intentos.length >= ev.intentosPermitidos;
  const cert = estadoCertificado({ accesoActivo: true, leccionesPendientes: curso.pendientes, evaluacionAprobada: aprobada });
  const leccionesDeMaterial = new Map(curso.lecciones.map((l) => [l.id, l.titulo]));

  return (
    <>
      <EncabezadoCampus
        titulo={curso.titulo}
        volver={{ href: '/campus', texto: 'Mis cursos' }}
        bajada={curso.version ? <span className="text-[15px]">Programa: versión {curso.version.numero}, publicada en {fechaVersion(curso.version.publicadaEn)}.</span> : undefined}
      />
      <Contenedor className="flex flex-wrap gap-x-12 gap-y-8 pb-20 pt-2">
        <div className="min-w-0 flex-[1_1_520px]">
          {aviso === 'version-cambiada' && (
            <div className="mb-6"><Aviso tipo="ok">Listo: ahora sigue la versión {curso.version?.numero} del programa. Su avance y sus resultados anteriores se conservan.</Aviso></div>
          )}
          {cambio && (
            <section aria-labelledby="version-nueva" className="mb-6 rounded-2xl border-[1.5px] border-borde-bandeja bg-arena p-5">
              <h2 id="version-nueva" className="m-0 text-[20px]">Hay una versión más reciente de este curso</h2>
              <p className="m-0 mt-1.5">
                Puede seguir con la suya todo el tiempo que quiera. Si prefiere la versión {cambio.nueva.numero}, vea primero qué cambia.
              </p>
              <div className="mt-3"><EnlaceAccion href={`/campus/cursos/${curso.slug}/version`}>Ver qué cambia en la versión {cambio.nueva.numero}</EnlaceAccion></div>
            </section>
          )}
          {aviso === 'certificado-listo' && (
            <div className="mb-6"><Aviso tipo="ok">¡Felicitaciones! Su certificado está listo para descargar.</Aviso></div>
          )}
          {aviso === 'certificado' && (
            <div className="mb-6"><Aviso tipo="error">Todavía no se puede emitir el certificado. Revise lo que falta en la columna de la derecha.</Aviso></div>
          )}
          <h2 className="m-0 mb-4 text-[26px]">Temario</h2>
          <TemarioCampus slug={curso.slug} lecciones={curso.lecciones} />
        </div>

        <aside aria-label="Avance, materiales y certificado" className="flex min-w-0 flex-[0_1_400px] flex-col gap-5">
          <Tarjeta titulo="Su avance">
            <BarraAvance valor={curso.avance} etiqueta="Avance del curso" />
            <p className="m-0 mt-2 text-[15px] text-tinta-suave">{textoAvance(hechas, curso.lecciones.length)} · {curso.avance} %</p>
            {curso.continuar && (
              <div className="mt-4">
                <EnlaceBoton href={`/campus/cursos/${curso.slug}/lecciones/${curso.continuar.id}`} tamano="compacto">
                  {hechas === 0 ? 'Empezar el curso' : 'Continuar donde lo dejó'}
                </EnlaceBoton>
              </div>
            )}
          </Tarjeta>

          {curso.materiales.length > 0 && (
            <Tarjeta titulo="Materiales descargables">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {curso.materiales.map((m) => (
                  <li key={m.id}>
                    <a href={`/campus/materiales/${m.id}`} className="font-bold text-oliva-profundo underline underline-offset-4">{m.titulo}</a>
                    <span className="block text-[14px] text-tinta-suave">PDF · {kb(m.tamanoBytes)} · {leccionesDeMaterial.get(m.leccionId)}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          {ev && (
            <Tarjeta titulo="Evaluación final">
              {aprobada ? (
                <p className="m-0">{ev.intentos.some((i) => i.aprobado)
                  ? `Aprobada con ${Math.max(...ev.intentos.filter((i) => i.aprobado).map((i) => i.puntaje))} puntos${ev.intentos.some((i) => i.aprobado && i.revisado) ? ' (resultado revisado a su favor)' : ''}.`
                  : 'Aprobada en la versión anterior del programa, con la misma evaluación.'}</p>
              ) : curso.pendientes > 0 ? (
                <p className="m-0">Se habilita cuando complete todas las lecciones. {cert.disponible ? '' : cert.mensaje}</p>
              ) : sinIntentos ? (
                <p className="m-0">Usó los {ev.intentosPermitidos} intentos disponibles. <Link href="/contacto" className="font-bold text-oliva-profundo">Escríbanos</Link> y lo ayudamos.</p>
              ) : (
                <>
                  <p className="m-0">Necesita {ev.puntajeMinimo} puntos para aprobar
                    {ev.intentosPermitidos != null ? `; le quedan ${ev.intentosPermitidos - ev.intentos.length} intentos` : ''}.</p>
                  <div className="mt-4"><EnlaceBoton href={`/campus/cursos/${curso.slug}/evaluacion`} tamano="compacto">Rendir la evaluación</EnlaceBoton></div>
                </>
              )}
              {ev.intentos.length > 0 && !aprobada && (
                <p className="m-0 mt-3 text-[15px] text-tinta-suave">Último intento: {ev.intentos.at(-1)!.puntaje} puntos.</p>
              )}
            </Tarjeta>
          )}

          <Tarjeta titulo="Certificado" id="certificado">
            {curso.certificado ? (
              <>
                <p className="m-0">Su certificado está listo.</p>
                <p className="m-0 mt-1 text-[15px] text-tinta-suave">Código de verificación: <span className="font-bold text-marron">{curso.certificado.codigo}</span></p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {/* Enlace común (no de la aplicación): la respuesta es un PDF, no una página. */}
                  <a href={`/campus/certificados/${curso.certificado.id}`} className="inline-flex min-h-[44px] items-center rounded-sm bg-oliva-profundo px-[18px] font-bold text-marfil no-underline hover:bg-marron">
                    Descargar PDF
                  </a>
                  <EnlaceAccion href={`/verificar/${curso.certificado.codigo}`}>Página de verificación</EnlaceAccion>
                </div>
              </>
            ) : cert.disponible ? (
              <form action={obtenerCertificado}>
                <input type="hidden" name="curso" value={curso.slug} />
                <p className="m-0">Cumplió todo lo necesario.</p>
                <button type="submit" className="mt-4 min-h-[44px] rounded-sm bg-oliva-profundo px-[18px] font-bold text-marfil hover:bg-marron">
                  Obtener mi certificado
                </button>
              </form>
            ) : (
              <p className="m-0">{cert.mensaje}</p>
            )}
            {curso.certificadoAnterior && (
              <p className="m-0 mt-4 text-[15px]">
                Certificado de una versión anterior: <a href={`/campus/certificados/${curso.certificadoAnterior.id}`} className="font-bold text-oliva-profundo">descargar</a>{' '}
                (código {curso.certificadoAnterior.codigo}). Sigue siendo válido.
              </p>
            )}
            <p className="m-0 mt-4 text-[14px] text-tinta-suave">
              Es un certificado de finalización emitido por Albor. No es una acreditación Montessori oficial.
            </p>
          </Tarjeta>
        </aside>
      </Contenedor>
    </>
  );
}
