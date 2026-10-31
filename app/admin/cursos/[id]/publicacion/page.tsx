import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin, estadoContenido, tieneHistorial } from '@/datos/admin-cursos';
import { requisitosPublicacion } from '@/dominio/cursos-admin';
import { formatearUSD } from '@/dominio/dinero';
import { AvisoAccion } from '@/ui/admin/campos';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { cambiarEstadoCurso, eliminarCurso } from '../../acciones';

export const metadata: Metadata = { title: 'Publicación' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const DONDE = { datos: '', temario: '/temario', evaluacion: '/evaluacion' } as const;

export default async function Publicacion({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  if (!c) notFound();
  const e = estadoContenido(c);
  const requisitos = requisitosPublicacion(e);
  const listo = requisitos.every((r) => r.cumplido);
  const conHistorial = tieneHistorial(c);
  const base = `/admin/cursos/${c.id}`;
  const h = c.historial;

  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <div className="grid max-w-[1100px] items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="requisitos" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h2 id="requisitos" className="m-0 text-[22px]">Para publicar</h2>
          <p className="m-0 mt-1 text-[14px] text-tinta-suave">La base de datos verifica exactamente lo mismo al publicar.</p>
          <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
            {requisitos.map((r) => (
              <li key={r.clave} className="flex items-start gap-3">
                <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${r.cumplido ? 'bg-oliva-profundo text-marfil' : 'border-2 border-error text-error'}`}>
                  {r.cumplido ? '✓' : '!'}
                </span>
                <span>
                  {r.texto}<span className="sr-only">{r.cumplido ? ': cumplido' : ': falta'}</span>
                  {!r.cumplido && <> · <Link href={`${base}${DONDE[r.donde]}`} className="font-bold text-oliva-profundo">Resolver</Link></>}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-4 text-[14px] text-tinta-suave">
            {e.leccionesVigentes === 1 ? '1 lección vigente' : `${e.leccionesVigentes} lecciones vigentes`} · {e.preguntasVigentes === 1 ? '1 pregunta' : `${e.preguntasVigentes} preguntas`} · {c.precioCentavos > 0 ? formatearUSD(c.precioCentavos) : 'sin precio'}
          </p>
        </section>

        <section aria-labelledby="estado" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h2 id="estado" className="m-0 text-[22px]">Estado del curso</h2>
          {c.estado === 'borrador' && (
            <>
              <p className="m-0 mt-2">En borrador: nadie lo ve en el sitio.</p>
              <div className="mt-4">
                {listo ? (
                  <ConfirmarAccion accion={cambiarEstadoCurso} campos={{ id: c.id, estado: 'publicado' }} textoBoton="Publicar el curso" titulo="¿Publicar el curso?" estilo="primario">
                    <p className="m-0">«{c.titulo}» aparecerá en el sitio con precio {formatearUSD(c.precioCentavos)}, {e.leccionesVigentes === 1 ? '1 lección' : `${e.leccionesVigentes} lecciones`} y una evaluación de {e.preguntasVigentes === 1 ? '1 pregunta' : `${e.preguntasVigentes} preguntas`}.</p>
                    <p className="m-0 text-[15px] text-tinta-suave">Las ventas siguen cerradas hasta conectar la pasarela de pago (Fase 6).</p>
                  </ConfirmarAccion>
                ) : (
                  <p className="m-0 rounded-lg bg-arena px-4 py-3 text-[15px]">Complete los requisitos de la izquierda para poder publicarlo.</p>
                )}
              </div>
            </>
          )}
          {c.estado === 'publicado' && (
            <>
              <p className="m-0 mt-2">Publicado{c.publicadoEn ? ` desde el ${new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'America/Guatemala' }).format(c.publicadoEn)}` : ''}. <Link href={`/cursos/${c.slug}`} className="font-bold text-oliva-profundo">Ver en el sitio</Link></p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <ConfirmarAccion accion={cambiarEstadoCurso} campos={{ id: c.id, estado: 'archivado' }} textoBoton="Archivar" titulo="¿Archivar el curso?" palabra="ARCHIVAR">
                  <p className="m-0">Deja de mostrarse en el sitio y no se puede comprar.</p>
                  <p className="m-0"><b>{h.alumnos === 0 ? 'Nadie lo compró todavía.' : `${h.alumnos === 1 ? 'La persona que lo compró conserva' : `Las ${h.alumnos} personas que lo compraron conservan`} el acceso`}</b>{h.alumnos > 0 ? ', su avance y sus certificados.' : ''}</p>
                </ConfirmarAccion>
                {h.alumnos === 0 && (
                  <ConfirmarAccion accion={cambiarEstadoCurso} campos={{ id: c.id, estado: 'borrador' }} textoBoton="Volver a borrador" titulo="¿Volver a borrador?" palabra="BORRADOR">
                    <p className="m-0">Deja de mostrarse en el sitio. Como nadie lo compró, puede seguir editándolo como borrador.</p>
                  </ConfirmarAccion>
                )}
              </div>
            </>
          )}
          {c.estado === 'archivado' && (
            <>
              <p className="m-0 mt-2">Archivado: no se muestra ni se vende. {h.alumnos > 0 && `${h.alumnos === 1 ? 'Su alumno conserva' : `Sus ${h.alumnos} alumnos conservan`} el acceso.`}</p>
              <div className="mt-4">
                {listo ? (
                  <ConfirmarAccion accion={cambiarEstadoCurso} campos={{ id: c.id, estado: 'publicado' }} textoBoton="Volver a publicar" titulo="¿Volver a publicar?" estilo="primario">
                    <p className="m-0">«{c.titulo}» vuelve a mostrarse en el sitio.</p>
                  </ConfirmarAccion>
                ) : <p className="m-0 text-[15px]">Para volver a publicarlo, complete los requisitos.</p>}
              </div>
            </>
          )}

          <div className="mt-6 border-t border-borde-bandeja pt-4">
            {conHistorial ? (
              <p className="m-0 text-[14px] text-tinta-suave">Este curso tiene alumnos, compras o certificados: no se puede eliminar. Su historial se conserva.</p>
            ) : (
              <ConfirmarAccion accion={eliminarCurso} campos={{ id: c.id }} textoBoton="Eliminar el curso" titulo="¿Eliminar el curso?" palabra="ELIMINAR" peligro estilo="peligro">
                <p className="m-0">«{c.titulo}» se borra definitivamente con su temario, materiales y evaluación. Nadie lo compró, así que no se pierde historial de alumnos.</p>
              </ConfirmarAccion>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
