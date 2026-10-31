import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { tallerAdmin } from '@/datos/admin-talleres';
import { formatearHorario, partesEnZona } from '@/dominio/talleres';
import { requisitosTaller } from '@/dominio/talleres-admin';
import { AvisoAccion } from '@/ui/admin/campos';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { TEXTOS_TALLER } from '@/ui/admin/talleres';
import { cambiarEstadoTaller, cancelarTaller, duplicarTaller, eliminarTaller, reprogramarTaller } from '../../acciones';

export const metadata: Metadata = { title: 'Estado del taller' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };
const campo = 'min-h-[48px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron';
const tarjeta = 'rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6';

/** Campos de fecha, hora y duración dentro de una confirmación (en la zona del taller). */
function CamposHorario({ prefijo, fecha, hora, duracion, zona }: { prefijo: string; fecha: string; hora: string; duracion: number; zona: string }) {
  return (
    <>
      <input type="hidden" name="zona" value={zona} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[15px] font-bold">Fecha<input id={`${prefijo}-fecha`} name="fecha" type="date" required defaultValue={fecha} className={campo} /></label>
        <label className="flex flex-col gap-1 text-[15px] font-bold">Hora<input id={`${prefijo}-hora`} name="hora" type="time" required defaultValue={hora} className={campo} /></label>
        <label className="flex flex-col gap-1 text-[15px] font-bold">Minutos<input id={`${prefijo}-duracion`} name="duracion" inputMode="numeric" required defaultValue={String(duracion)} className={campo} /></label>
      </div>
      <p className="m-0 text-[14px] text-tinta-suave">En la zona del taller ({zona.split('/').pop()?.replace(/_/g, ' ')}).</p>
    </>
  );
}

export default async function EstadoTaller({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const t = await tallerAdmin(id);
  if (!t) notFound();
  const requisitos = requisitosTaller(t);
  const listo = requisitos.every((r) => r.cumplido);
  const duracion = Math.round((t.terminaEn.getTime() - t.iniciaEn.getTime()) / 60000);
  const p = partesEnZona(t.iniciaEn, t.zonaHoraria);
  const enUnaSemana = partesEnZona(new Date(t.iniciaEn.getTime() + 7 * 86400000), t.zonaHoraria);
  const terminado = t.terminaEn.getTime() < Date.now();
  const n = t.confirmadas;
  const pagas = t.inscripciones.filter((i) => i.estado === 'confirmada' && i.origen === 'compra').length;

  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} textos={TEXTOS_TALLER} />
      <div className="grid max-w-[1100px] grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="publicacion" className={tarjeta}>
          <h2 id="publicacion" className="m-0 text-[22px]">Publicación</h2>
          {t.estado === 'borrador' && (
            <>
              <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
                {requisitos.map((r) => (
                  <li key={r.clave} className="flex items-start gap-3">
                    <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${r.cumplido ? 'bg-oliva-profundo text-marfil' : 'border-2 border-error text-error'}`}>{r.cumplido ? '✓' : '!'}</span>
                    <span>{r.texto}<span className="sr-only">{r.cumplido ? ': cumplido' : ': falta'}</span>{!r.cumplido && <> · <Link href={`/admin/talleres/${t.id}`} className="font-bold text-oliva-profundo">Resolver</Link></>}</span>
                  </li>
                ))}
              </ul>
              {t.sinEnlace && <p className="m-0 mt-3 text-[15px] text-tinta-suave">Puede publicarlo sin enlace de videollamada; acuérdese de cargarlo antes del encuentro.</p>}
              <div className="mt-4">
                {listo ? (
                  <ConfirmarAccion accion={cambiarEstadoTaller} campos={{ id: t.id, estado: 'publicado' }} textoBoton="Publicar el taller" titulo="¿Publicar el taller?" estilo="primario">
                    <p className="m-0">«{t.titulo}» aparecerá en el sitio: {formatearHorario(t.iniciaEn, t.zonaHoraria)}.</p>
                    <p className="m-0 text-[15px] text-tinta-suave">{t.precioCentavos > 0 ? 'La venta abre al conectar la pasarela de pago (Fase 6).' : 'Es gratuito: las personas con cuenta pueden inscribirse desde ya.'}</p>
                  </ConfirmarAccion>
                ) : <p className="m-0 rounded-lg bg-arena px-4 py-3 text-[15px]">Complete lo que falta para poder publicarlo.</p>}
              </div>
            </>
          )}
          {t.estado === 'publicado' && <p className="m-0 mt-2">Publicado. <Link href={`/talleres/${t.slug}`} className="font-bold text-oliva-profundo">Ver en el sitio</Link></p>}
          {t.estado === 'cancelado' && (
            <p className="m-0 mt-2">Cancelado{t.canceladoEn ? ` el ${new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: t.zonaHoraria }).format(t.canceladoEn)}` : ''}. Motivo: {t.motivoCancelacion}</p>
          )}
          {t.estado === 'finalizado' && <p className="m-0 mt-2">Finalizado. Puede marcar la asistencia en Participantes.</p>}
          {t.estado === 'archivado' && <p className="m-0 mt-2">Archivado: no se muestra en el sitio. Inscripciones e historial se conservan.</p>}

          {(t.estado === 'cancelado' || t.estado === 'finalizado' || (t.estado === 'publicado' && terminado)) && (
            <div className="mt-4">
              <ConfirmarAccion accion={cambiarEstadoTaller} campos={{ id: t.id, estado: 'archivado' }} textoBoton="Archivar" titulo="¿Archivar el taller?" palabra="ARCHIVAR">
                <p className="m-0">Deja de mostrarse en el sitio. Las inscripciones, pagos y asistencia se conservan, y quienes se inscribieron lo siguen viendo en su campus.</p>
              </ConfirmarAccion>
            </div>
          )}
          {t.estado === 'borrador' && (
            <div className="mt-6 border-t border-borde-bandeja pt-4">
              {t.tieneHistorial ? (
                <p className="m-0 text-[14px] text-tinta-suave">Tiene inscripciones u órdenes: no se puede eliminar.</p>
              ) : (
                <ConfirmarAccion accion={eliminarTaller} campos={{ id: t.id }} textoBoton="Eliminar el taller" titulo="¿Eliminar el taller?" palabra="ELIMINAR" peligro estilo="peligro">
                  <p className="m-0">«{t.titulo}» se borra definitivamente. Nadie se inscribió ni pagó.</p>
                </ConfirmarAccion>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="duplicar" className={tarjeta}>
          <h2 id="duplicar" className="m-0 text-[22px]">Duplicar</h2>
          <p className="m-0 mt-1 text-[15px] text-tinta-suave">Crea un borrador nuevo con título, descripción, zona, cupo, precio, plataforma y recordatorios. No copia inscriptos, reservas, pagos, reembolsos, asistencia, enlaces de reunión ni avisos.</p>
          <div className="mt-4">
            <ConfirmarAccion accion={duplicarTaller} campos={{ id: t.id }} textoBoton="Duplicar el taller" titulo="Duplicar como borrador" textoConfirmar="Crear la copia">
              <p className="m-0">Elija la fecha de la copia:</p>
              <CamposHorario prefijo="dup" fecha={enUnaSemana.fecha} hora={enUnaSemana.hora} duracion={duracion} zona={t.zonaHoraria} />
            </ConfirmarAccion>
          </div>
        </section>

        {t.estado === 'publicado' && !terminado && (
          <section aria-labelledby="reprogramar" className={tarjeta}>
            <h2 id="reprogramar" className="m-0 text-[22px]">Reprogramar</h2>
            <p className="m-0 mt-1 text-[15px] text-tinta-suave">
              {n === 0 ? 'Todavía no hay inscriptos.' : `${n === 1 ? '1 persona inscripta conserva' : `Las ${n} personas inscriptas conservan`} su lugar y sus pagos.`}
              {' '}Se registra el motivo y queda pendiente el aviso a cada persona; los recordatorios se recalculan con la fecha nueva.
            </p>
            <div className="mt-4">
              <ConfirmarAccion accion={reprogramarTaller} campos={{ id: t.id }} textoBoton="Reprogramar" titulo="¿Reprogramar el taller?" palabra="REPROGRAMAR">
                <p className="m-0">Fecha actual: {formatearHorario(t.iniciaEn, t.zonaHoraria)}. {n > 0 && <b>Afecta a {n === 1 ? '1 persona' : `${n} personas`}.</b>}</p>
                <CamposHorario prefijo="rep" fecha={p.fecha} hora={p.hora} duracion={duracion} zona={t.zonaHoraria} />
                <label className="flex flex-col gap-1 text-[15px] font-bold">Motivo (queda registrado)
                  <textarea name="motivo" required minLength={10} maxLength={500} rows={2} className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 py-2 font-normal text-marron" />
                </label>
              </ConfirmarAccion>
            </div>
          </section>
        )}

        {(t.estado === 'publicado' || t.estado === 'borrador') && !terminado && (
          <section aria-labelledby="cancelar" className={tarjeta}>
            <h2 id="cancelar" className="m-0 text-[22px]">Cancelar</h2>
            <p className="m-0 mt-1 text-[15px] text-tinta-suave">No se elimina: queda cancelado con su historial. Se liberan las reservas, el enlace deja de mostrarse y se registran los avisos.</p>
            <div className="mt-4">
              <ConfirmarAccion accion={cancelarTaller} campos={{ id: t.id }} textoBoton="Cancelar el taller" titulo="¿Cancelar el taller?" palabra="CANCELAR" peligro estilo="peligro">
                <p className="m-0">
                  {n === 0 ? 'No hay inscriptos.' : <><b>Afecta a {n === 1 ? '1 persona' : `${n} personas`}.</b> {pagas > 0 && `${pagas === 1 ? 'La inscripción paga queda' : `Las ${pagas} inscripciones pagas quedan`} en «reembolso pendiente» (se gestiona en la Fase 6). `}Las gratuitas y de cortesía se cancelan.</>}
                  {t.reservas > 0 && ` Se liberan ${t.reservas === 1 ? '1 reserva' : `${t.reservas} reservas`} en curso.`}
                </p>
                <label className="flex flex-col gap-1 text-[15px] font-bold">Motivo (queda registrado y se incluye en el aviso)
                  <textarea name="motivo" required minLength={10} maxLength={500} rows={2} className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 py-2 font-normal text-marron" />
                </label>
              </ConfirmarAccion>
            </div>
          </section>
        )}
      </div>

      {t.reprogramaciones.length > 0 && (
        <section aria-labelledby="historial" className="mt-6 max-w-[1100px]">
          <h2 id="historial" className="m-0 text-[20px]">Reprogramaciones</h2>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {t.reprogramaciones.map((r) => (
              <li key={r.creadoEn.toISOString()} className="rounded-xl bg-marfil px-4 py-3 text-[15px]">
                {formatearHorario(r.iniciaAntes, t.zonaHoraria)} → <b>{formatearHorario(r.iniciaDespues, t.zonaHoraria)}</b> · {r.inscriptos} inscriptos
                <span className="block text-tinta-suave">Motivo: {r.motivo}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
