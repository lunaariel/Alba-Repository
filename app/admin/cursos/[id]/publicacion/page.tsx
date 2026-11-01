import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cambiosDelBorrador, cursoAdmin, estadoContenido, tieneHistorial } from '@/datos/admin-cursos';
import { requisitosPublicacion } from '@/dominio/cursos-admin';
import { formatearUSD } from '@/dominio/dinero';
import { AvisoAccion } from '@/ui/admin/campos';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { cambiarEstadoCurso, duplicarCurso, eliminarCurso, publicarVersion } from '../../acciones';

export const metadata: Metadata = { title: 'Publicación' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const DONDE = { datos: '', temario: '/temario', evaluacion: '/evaluacion' } as const;
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'America/Guatemala' }).format(d);
const intentosTexto = (n: number | null) => (n === null ? 'sin límite' : String(n));
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

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
  const cambios = cambiosDelBorrador(c);
  const hayCambios = cambios.leccionesNuevas.length + cambios.leccionesQuitadas.length + cambios.preguntasNuevas + cambios.preguntasQuitadas > 0
    || cambios.objetivosCambian || cambios.modalidad.length > 0 || cambios.ordenCambia.length > 0
    || (cambios.criterios !== null && (cambios.criterios.puntaje[0] !== cambios.criterios.puntaje[1] || cambios.criterios.intentos[0] !== cambios.criterios.intentos[1]));

  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <div className="grid max-w-[1100px] grid-cols-1 items-start gap-6 lg:grid-cols-2">
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
          {c.duracionComercialMeses === null && (
            <p className="m-0 mt-4 rounded-lg border-[1.5px] border-[#D9C48C] bg-[#F5EBCF] px-3 py-2 text-[14px] text-[#6B5420]">
              Falta la duración comercial (en <Link href={base} className="font-bold text-[#6B5420]">Datos y precio</Link>): sin ella el curso se puede publicar,
              pero nadie puede comprarlo, porque las condiciones de acceso se muestran antes de pagar.
            </p>
          )}
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
                    <p className="m-0">«{c.titulo}» aparecerá en el sitio con precio {formatearUSD(c.precioCentavos)}, {e.leccionesVigentes === 1 ? '1 lección' : `${e.leccionesVigentes} lecciones`} y {e.evaluacion?.modalidad === 'formativa'
                      ? 'evaluación formativa'
                      : `una evaluación de ${e.preguntasVigentes === 1 ? '1 pregunta' : `${e.preguntasVigentes} preguntas`}`}.</p>
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
            <ConfirmarAccion accion={duplicarCurso} campos={{ id: c.id }} textoBoton="Duplicar el curso" titulo="¿Duplicar el curso?" textoConfirmar="Crear la copia">
              <p className="m-0">Se crea un curso nuevo en borrador con los datos, el temario, los PDF y la evaluación vigentes del borrador
                (sin lo retirado ni lo bloqueado). No se copian alumnos, compras, avances, intentos, certificados, versiones ni historial.</p>
              <label htmlFor="titulo-copia" className="mt-2 text-[15px] font-bold">Título de la copia</label>
              <input id="titulo-copia" name="titulo" required minLength={3} maxLength={140} defaultValue={`${c.titulo} (copia)`}
                className="min-h-[50px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 text-marron" />
            </ConfirmarAccion>
          </div>
          <div className="mt-4 border-t border-borde-bandeja pt-4">
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

      {c.versiones.length > 0 && (
        <section aria-labelledby="versiones" className="mt-6 max-w-[1100px] rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h2 id="versiones" className="m-0 text-[22px]">Versiones del programa</h2>
          <p className="m-0 mt-1 max-w-[760px] text-[15px] text-tinta-suave">
            Lo que edita en Temario y Evaluación es el borrador. Cada versión publicada queda fija: quienes la siguen ven exactamente
            ese contenido y esos criterios. Una versión nueva se aplica a quienes compren desde ese momento; los alumnos actuales
            pueden pasarse si lo desean, nunca de forma automática.
          </p>

          {cambios.vigente && (
            <div className="mt-5 rounded-xl bg-arena px-5 py-4">
              <h3 className="m-0 text-[18px]">Borrador frente a la versión vigente ({cambios.vigente.numero})</h3>
              {hayCambios ? (
                <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5 text-[15px]">
                  {cambios.leccionesNuevas.length > 0 && <li>Lecciones nuevas: {cambios.leccionesNuevas.join(', ')}.</li>}
                  {cambios.leccionesQuitadas.length > 0 && <li>Lecciones quitadas: {cambios.leccionesQuitadas.join(', ')}.</li>}
                  {cambios.objetivosCambian && <li>Objetivos de aprendizaje modificados (Datos y precio).</li>}
                  {cambios.preguntasNuevas > 0 && <li>{plural(cambios.preguntasNuevas, 'pregunta nueva o reemplazada', 'preguntas nuevas o reemplazadas')}.</li>}
                  {cambios.preguntasQuitadas > 0 && <li>{plural(cambios.preguntasQuitadas, 'pregunta quitada', 'preguntas quitadas')}.</li>}
                  {cambios.modalidad.length === 0 && cambios.criterios && cambios.criterios.puntaje[0] !== cambios.criterios.puntaje[1] && <li>Puntaje mínimo: {cambios.criterios.puntaje[0]} → {cambios.criterios.puntaje[1]}.</li>}
                  {cambios.modalidad.length === 0 && cambios.criterios && cambios.criterios.intentos[0] !== cambios.criterios.intentos[1] && <li>Intentos: {intentosTexto(cambios.criterios.intentos[0])} → {intentosTexto(cambios.criterios.intentos[1])}.</li>}
                  {cambios.modalidad.map((t) => <li key={t}>{t}</li>)}
                  {cambios.ordenCambia.length > 0 && (
                    <li>Cambios de orden:
                      <ul className="m-0 mt-1 list-[circle] pl-5">{cambios.ordenCambia.map((t) => <li key={t}>{t}.</li>)}</ul>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="m-0 mt-2 text-[15px]">No hay cambios de lecciones, preguntas, orden, objetivos ni criterios. (El precio no forma parte de la versión.)</p>
              )}
              {c.estado === 'publicado' && (
                <div className="mt-4">
                  {listo ? (
                    <ConfirmarAccion accion={publicarVersion} campos={{ id: c.id }} textoBoton={`Publicar la versión ${cambios.vigente.numero + 1}`}
                      titulo={`¿Publicar la versión ${cambios.vigente.numero + 1}?`} palabra="PUBLICAR" estilo="primario">
                      <p className="m-0">Quienes compren desde ahora seguirán la versión {cambios.vigente.numero + 1}.</p>
                      <p className="m-0"><b>{h.alumnos === 0 ? 'Todavía nadie tiene acceso.' : `${plural(h.alumnos, 'persona sigue', 'personas siguen')} en su versión actual`}</b>{h.alumnos > 0 ? ': conservan su avance, intentos y certificados, y podrán decidir si se pasan.' : ''}</p>
                      <label htmlFor="resumen-version" className="mt-2 text-[15px] font-bold">Qué cambió (lo verán los alumnos antes de decidir)</label>
                      <textarea id="resumen-version" name="resumen" required minLength={5} maxLength={600} rows={3}
                        className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 py-3 text-marron" />
                    </ConfirmarAccion>
                  ) : (
                    <p className="m-0 text-[15px]">Para publicar una versión nueva, complete los requisitos de la lista.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
              <caption className="sr-only">Historial de versiones</caption>
              <thead>
                <tr className="border-b-[1.5px] border-borde-bandeja text-tinta-suave">
                  <th scope="col" className="py-2 pr-4 font-bold">Versión</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Publicada</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Contenido</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Criterios</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Alumnos</th>
                  <th scope="col" className="py-2 font-bold">Qué cambió</th>
                </tr>
              </thead>
              <tbody>
                {c.versiones.map((v) => (
                  <tr key={v.id} className="border-b border-borde-bandeja align-top">
                    <td className="py-2 pr-4 font-bold">{v.numero}{v.vigente && <span className="ml-2 rounded-full bg-oliva-profundo px-2 py-0.5 text-[12px] text-marfil">vigente</span>}</td>
                    <td className="py-2 pr-4">{fecha(v.publicadaEn)}</td>
                    <td className="py-2 pr-4">{plural(v.lecciones, 'lección', 'lecciones')} · {plural(v.preguntas, 'pregunta', 'preguntas')}</td>
                    <td className="py-2 pr-4">{v.config.modalidad === 'sumativa'
                      ? <>Evaluación final · mínimo {v.puntajeMinimo} · intentos {intentosTexto(v.intentosPermitidos)}</>
                      : <>Formativa{v.config.requiereActividades ? ' · actividades' : ''}{v.config.requiereValidacion ? ' · validación docente' : ''}{v.config.conCertificado ? '' : ' · sin certificado'}</>}</td>
                    <td className="py-2 pr-4">{v.alumnos} · {plural(v.certificados, 'certificado', 'certificados')}</td>
                    <td className="py-2">{v.resumen ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}