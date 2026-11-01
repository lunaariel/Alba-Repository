import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cursoAdmin, periodosCurso, seguimientoCurso, type AlumnoSeguimiento, type PeriodoAdmin } from '@/datos/admin-cursos';
import { ORIGENES_PERIODO, revocableDesdePanel } from '@/dominio/accesos';
import { formatearUSD } from '@/dominio/dinero';
import { nombreModalidad, pendientesFinalizacion } from '@/dominio/evaluacion';
import { AvisoAccion } from '@/ui/admin/campos';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { EstadoChip } from '@/ui/admin/estructura';
import { anularValidacion, otorgarBeca, revocarBeca, validarFinalizacion } from '../../acciones';

export const metadata: Metadata = { title: 'Alumnos del curso' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(d);
const area = 'rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 py-2 font-normal text-marron';

const campo = 'min-h-[44px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 font-normal text-marron';

/** Formulario de beca: duración elegida por la admin, con fin o «sin vencimiento» expreso. */
function FormBeca({ cursoId }: { cursoId: string }) {
  return (
    <ConfirmarAccion accion={otorgarBeca} campos={{ curso: cursoId }} textoBoton="Otorgar una beca" titulo="Otorgar una beca o acceso gratuito" estilo="secundario">
      <p className="m-0 text-[15px]">No crea una compra ni un recibo. No usa la duración comercial: usted elige las fechas. Si la persona ya tuvo el curso, conserva su avance, su versión y sus certificados.</p>
      <label className="flex flex-col gap-1 text-[15px] font-bold">Correo de la persona
        <input name="correo" type="email" required maxLength={200} className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-[15px] font-bold">Inicio (vacío = hoy)
        <input name="inicio" type="date" className={campo} />
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[15px] font-bold">Duración</legend>
        <label className="flex items-center gap-2 font-normal"><input type="radio" name="duracion" value="fecha" defaultChecked required className="size-5" /> Hasta una fecha</label>
        <label className="flex flex-col gap-1 pl-7 text-[15px] font-bold">Fin (incluido)
          <input name="fin" type="date" className={campo} />
        </label>
        <label className="flex items-center gap-2 font-normal"><input type="radio" name="duracion" value="sin_vencimiento" className="size-5" /> Sin vencimiento (autorizado expresamente)</label>
      </fieldset>
      <label className="flex flex-col gap-1 text-[15px] font-bold">Motivo (obligatorio)
        <textarea name="motivo" required minLength={10} maxLength={500} rows={2} className={area} />
      </label>
      <label className="flex flex-col gap-1 text-[15px] font-bold">Quién lo autoriza
        <input name="responsable" required minLength={3} maxLength={120} className={campo} />
      </label>
    </ConfirmarAccion>
  );
}

function Periodos({ periodos, cursoId }: { periodos: PeriodoAdmin[]; cursoId: string }) {
  if (!periodos.length) return null;
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[14px]">
      {periodos.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-2">
          <span className={p.estado === 'revocado' ? 'text-tinta-suave line-through' : ''}>
            {ORIGENES_PERIODO[p.origen]}{p.precioCentavos !== null && p.origen === 'compra' ? ` (${formatearUSD(p.precioCentavos)})` : ''}: {fecha(p.iniciaEn)} – {p.venceEn ? fecha(p.venceEn) : 'sin vencimiento'}
          </span>
          {p.estado === 'revocado' && <span className="text-tinta-suave">· revocado{p.revocadoMotivo ? `: ${p.revocadoMotivo}` : ''}</span>}
          {p.origen !== 'compra' && p.motivo && <span className="text-tinta-suave">· {p.motivo}{p.responsable ? ` (${p.responsable})` : ''}</span>}
          {revocableDesdePanel(p) && (
            <ConfirmarAccion accion={revocarBeca} campos={{ curso: cursoId, periodo: p.id }} textoBoton="Revocar" titulo="¿Revocar esta beca?" estilo="enlacePeligro" peligro>
              <p className="m-0">La persona pierde este período de acceso. Su avance, sus resultados y sus certificados se conservan. Queda registrado.</p>
              <label className="flex flex-col gap-1 text-[15px] font-bold">Motivo (obligatorio)
                <textarea name="motivo" required minLength={10} maxLength={500} rows={2} className={area} />
              </label>
            </ConfirmarAccion>
          )}
        </li>
      ))}
    </ul>
  );
}

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
  const [alumnos, periodos] = await Promise.all([seguimientoCurso(c.id), periodosCurso(c.id)]);
  const versiones = c.versiones.slice().sort((a, b) => b.numero - a.numero);
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <div className="mb-6 flex max-w-[1100px] flex-wrap items-center justify-between gap-3 rounded-2xl bg-arena px-5 py-4">
        <p className="m-0 max-w-[640px] text-[15px]">Cada persona tiene una inscripción con su versión y su historial, y uno o más períodos de acceso: compras, becas o accesos otorgados.</p>
        <FormBeca cursoId={c.id} />
      </div>
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
                            <span>· {!a.vigente && a.proximoInicio
                              ? `sin acceso hasta el ${fecha(a.proximoInicio)} (período ya concedido${a.venceEn ? `, hasta el ${fecha(a.venceEn)}` : ''})`
                              : a.venceEn ? `${a.vigente ? 'acceso hasta el' : 'acceso vencido el'} ${fecha(a.venceEn)}` : 'acceso sin vencimiento'}</span>
                          </div>
                          {!a.tieneCertificado && falta.length > 0 && <p className="m-0 mt-1 text-[14px]">Le falta: {falta.join(' ')}</p>}
                          <Periodos periodos={periodos.filter((p) => p.perfilId === a.perfilId)} cursoId={c.id} />
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
