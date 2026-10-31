import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cursoAdmin, seguimientoCurso, type AlumnoSeguimiento } from '@/datos/admin-cursos';
import { nombreModalidad, pendientesFinalizacion } from '@/dominio/evaluacion';
import { AvisoAccion } from '@/ui/admin/campos';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { EstadoChip } from '@/ui/admin/estructura';
import { anularValidacion, validarFinalizacion } from '../../acciones';

export const metadata: Metadata = { title: 'Alumnos del curso' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(d);
const area = 'rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 py-2 font-normal text-marron';

function Estado({ a }: { a: AlumnoSeguimiento }) {
  const f = a.finalizacion;
  if (!f) return <EstadoChip estado="error" texto="Sin datos" />;
  if (a.tieneCertificado) return <EstadoChip estado="publicado" texto="Certificado emitido" />;
  if (f.finalizado) return <EstadoChip estado="publicado" texto={f.elegibleCertificado ? 'Terminó · puede obtener el certificado' : 'Terminó'} />;
  return <EstadoChip estado="pendiente" texto="En curso" />;
}

/** Alumnos con acceso, agrupados por la versión que siguen, con su estado de finalización y la validación docente. */
export default async function Alumnos({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  if (!c) notFound();
  const alumnos = await seguimientoCurso(c.id);
  const versiones = c.versiones.slice().sort((a, b) => b.numero - a.numero);
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      {alumnos.length === 0 ? (
        <div className="max-w-[760px] rounded-2xl bg-arena p-6">
          <p className="m-0">Todavía nadie tiene acceso a este curso.</p>
          <p className="m-0 mt-1 text-[15px] text-tinta-suave">Cuando alguien lo compre o le conceda acceso, aparecerá aquí con la versión que sigue y su avance.</p>
        </div>
      ) : (
        <div className="flex max-w-[1100px] flex-col gap-6">
          {versiones.filter((v) => alumnos.some((a) => a.version === v.numero)).map((v) => {
            const grupo = alumnos.filter((a) => a.version === v.numero);
            const validacion = v.config.modalidad === 'formativa' && v.config.requiereValidacion;
            return (
              <section key={v.id} aria-labelledby={`version-${v.numero}`} className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
                <h2 id={`version-${v.numero}`} className="m-0 text-[22px]">
                  Versión {v.numero}{v.vigente ? ' (vigente)' : ''} · {grupo.length === 1 ? '1 persona' : `${grupo.length} personas`}
                </h2>
                <p className="m-0 mt-1 text-[15px] text-tinta-suave">
                  {nombreModalidad(v.config)}
                  {v.config.modalidad === 'sumativa' ? ` · mínimo ${v.config.puntajeMinimo}` : ''}
                  {v.config.requiereActividades ? ' · actividades formativas' : ''}{validacion ? ' · validación docente' : ''}
                  {v.config.conCertificado ? '' : ' · sin certificado'}
                </p>
                <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
                  {grupo.map((a) => {
                    const f = a.finalizacion;
                    const falta = f ? pendientesFinalizacion(f) : [];
                    return (
                      <li key={a.perfilId} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 rounded-xl border-[1.5px] border-borde-bandeja px-4 py-3">
                        <div className="min-w-0 flex-[1_1_320px]">
                          <p className="m-0 font-bold">{a.nombre}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-tinta-suave">
                            <Estado a={a} />
                            {f && f.leccionesPendientes > 0 && <span>{f.leccionesPendientes === 1 ? 'falta 1 lección' : `faltan ${f.leccionesPendientes} lecciones`}</span>}
                            {v.config.requiereActividades && <span>· actividades: {f?.actividadesCompletas ? 'completas' : a.enviosFormativos ? `${a.enviosFormativos} envío(s), incompletas` : 'sin envíos'}</span>}
                            {a.ultimoEnvio && <span>· último envío {fecha(a.ultimoEnvio)}</span>}
                            {f?.modalidad === 'sumativa' && <span>· evaluación {f.evaluacionAprobada ? 'aprobada' : 'pendiente'}</span>}
                          </div>
                          {!a.tieneCertificado && falta.length > 0 && <p className="m-0 mt-1 text-[14px]">Le falta: {falta.join(' ')}</p>}
                        </div>
                        {validacion && (
                          <div className="flex flex-wrap items-center gap-3">
                            {a.validacionId ? (
                              <>
                                <EstadoChip estado="publicado" texto="Validada por usted" />
                                {!a.tieneCertificado && (
                                  <ConfirmarAccion accion={anularValidacion} campos={{ curso: c.id, validacion: a.validacionId }} textoBoton="Anular" titulo="¿Anular la validación?" estilo="enlacePeligro" peligro>
                                    <p className="m-0">Use esta opción solo si validó por error. Queda registrado.</p>
                                    <label className="flex flex-col gap-1 text-[15px] font-bold">Motivo (obligatorio)
                                      <textarea name="motivo" required minLength={10} maxLength={500} rows={2} className={area} />
                                    </label>
                                  </ConfirmarAccion>
                                )}
                              </>
                            ) : (
                              <ConfirmarAccion accion={validarFinalizacion} campos={{ curso: c.id, perfil: a.perfilId }} textoBoton="Validar finalización"
                                titulo={`¿Validar la finalización de ${a.nombre}?`} estilo="secundario">
                                <p className="m-0">Confirma que acompañó su recorrido y que cumplió lo esperado. No emite el certificado: la persona lo obtiene cuando cumple todos los requisitos.</p>
                                <label className="flex flex-col gap-1 text-[15px] font-bold">Nota de seguimiento (obligatoria)
                                  <textarea name="nota" required minLength={10} maxLength={1000} rows={3} className={area} />
                                </label>
                              </ConfirmarAccion>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
