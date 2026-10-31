import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tallerAdmin } from '@/datos/admin-talleres';
import { centavosATexto } from '@/dominio/cursos-admin';
import { ESTADOS_GRABACION_TEXTO, SIGUIENTES_GRABACION } from '@/dominio/talleres-admin';
import { AvisoAccion } from '@/ui/admin/campos';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { EstadoChip } from '@/ui/admin/estructura';
import { TEXTOS_TALLER } from '@/ui/admin/talleres';
import { cambiarEstadoGrabacion, guardarCondicionesGrabacion, guardarRevisionGrabacion } from '../../acciones';

export const metadata: Metadata = { title: 'Grabación' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };
const tarjeta = 'rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6';
const campo = 'min-h-[46px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron';
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(d);
const chip = (e: string) => (e === 'publicada' ? 'publicado' : ['fallida', 'faltante', 'no_publicable'].includes(e) ? 'error' : ['retirada', 'no_corresponde'].includes(e) ? 'archivado' : e === 'prevista' ? 'borrador' : 'pendiente') as 'publicado' | 'error' | 'archivado' | 'borrador' | 'pendiente';

/** Modelo y estados de la grabación. La captura, edición y reproducción reales llegan en la Fase 6. */
export default async function Grabacion({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const t = await tallerAdmin(id);
  if (!t) notFound();
  const g = t.grabacion;
  if (!g) notFound();
  const c = g.condiciones;
  const pasos = SIGUIENTES_GRABACION[g.estado] ?? [];
  const revisionCompleta = g.revision.sinImagen && g.revision.sinVoces && g.revision.sinDatos && g.revision.contenido;
  const opcion = (sinV: boolean, dias: number | null) => (sinV ? 'sin_vencimiento' : dias ? 'dias' : 'sin_definir');

  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} textos={TEXTOS_TALLER} />
      <p className="m-0 mb-5 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
        Todo taller se graba. La grabación original de Meet nunca se publica: la versión para alumnos y compradores muestra solo a la maestra y sus materiales.
        Si no se puede editar de forma segura, queda sin publicar. <b>Por ahora no hay video real:</b> los estados se cambian a mano; la captura, la edición y el reproductor llegan en la Fase 6.
      </p>
      <div className="grid max-w-[1100px] grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="estado-grabacion" className={tarjeta}>
          <h2 id="estado-grabacion" className="m-0 text-[22px]">Estado</h2>
          <div className="mt-3"><EstadoChip estado={chip(g.estado)} texto={ESTADOS_GRABACION_TEXTO[g.estado] ?? g.estado} /></div>
          <p className="m-0 mt-3 text-[15px] text-tinta-suave">
            Accesos vigentes: {g.accesos.inscripcion} por inscripción{g.accesos.compra ? ` y ${g.accesos.compra} por compra` : ''}. Quien se inscribió conserva el acceso aunque no haya asistido.
          </p>
          {pasos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              {pasos.map((p) => (
                <ConfirmarAccion key={p.estado} accion={cambiarEstadoGrabacion} campos={{ taller: t.id, grabacion: g.id, estado: p.estado }}
                  textoBoton={p.texto} titulo={`${p.texto}?`} estilo={p.motivo ? 'peligro' : 'secundario'} peligro={Boolean(p.motivo)}>
                  <p className="m-0">La grabación pasa a «{ESTADOS_GRABACION_TEXTO[p.estado]}». Queda en el historial.</p>
                  <label className="flex flex-col gap-1 text-[15px] font-bold">{p.motivo ? 'Motivo (obligatorio)' : 'Nota (opcional)'}
                    <textarea name="motivo" required={p.motivo} minLength={p.motivo ? 10 : undefined} maxLength={500} rows={2} className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 py-2 font-normal text-marron" />
                  </label>
                </ConfirmarAccion>
              ))}
              {g.estado === 'verificada' && (
                <ConfirmarAccion accion={cambiarEstadoGrabacion} campos={{ taller: t.id, grabacion: g.id, estado: 'publicada' }} textoBoton="Publicar la grabación"
                  titulo="¿Publicar la grabación?" palabra="PUBLICAR" estilo="primario">
                  <p className="m-0">Las personas inscriptas en el taller (hayan asistido o no) reciben el acceso con las condiciones definidas. Las que cancelaron, no.</p>
                  <p className="m-0 text-[15px] text-tinta-suave">Hasta la Fase 6 no hay reproductor: el campus mostrará la grabación como publicada sin video.</p>
                </ConfirmarAccion>
              )}
            </div>
          )}
          {g.historial.length > 0 && (
            <details className="mt-5 text-[14px]">
              <summary className="cursor-pointer font-bold text-oliva-profundo">Historial ({g.historial.length})</summary>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                {g.historial.map((h) => (
                  <li key={h.creadoEn.toISOString() + h.despues}>{fecha(h.creadoEn)} · {ESTADOS_GRABACION_TEXTO[h.antes]} → <b>{ESTADOS_GRABACION_TEXTO[h.despues]}</b>{h.motivo ? ` · ${h.motivo}` : ''}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section aria-labelledby="revision" className={tarjeta}>
          <h2 id="revision" className="m-0 text-[22px]">Revisión de la versión para publicar</h2>
          <p className="m-0 mt-1 text-[15px] text-tinta-suave">Apagar las cámaras no alcanza: también pueden quedar voces, nombres, mensajes del chat o datos en pantalla.</p>
          <form action={guardarRevisionGrabacion} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="taller" value={t.id} />
            <input type="hidden" name="grabacion" value={g.id} />
            {([['sin_imagen', 'Sin imagen de participantes', g.revision.sinImagen], ['sin_voces', 'Sin voces ni intervenciones reconocibles de participantes', g.revision.sinVoces],
              ['sin_datos', 'Sin nombres, mensajes ni datos de participantes en pantalla', g.revision.sinDatos], ['contenido', 'Contenido final verificado (solo la maestra y materiales autorizados)', g.revision.contenido]] as const)
              .map(([n, texto, valor]) => (
                <label key={n} className="flex min-h-[40px] items-start gap-2.5">
                  <input type="checkbox" name={n} value="si" defaultChecked={valor} disabled={g.estado !== 'en_revision'} className="mt-1 h-5 w-5 shrink-0 accent-[#4E6049]" />
                  <span>{texto}</span>
                </label>
              ))}
            {g.estado === 'en_revision'
              ? <div><button type="submit" className="min-h-[44px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-4 font-bold text-oliva-profundo hover:bg-arena">Guardar revisión</button></div>
              : <p className="m-0 text-[14px] text-tinta-suave">{revisionCompleta ? 'Revisión completa.' : 'La revisión se registra con la grabación «En revisión».'}</p>}
          </form>
        </section>

        <section aria-labelledby="condiciones" className={`${tarjeta} lg:col-span-2`}>
          <h2 id="condiciones" className="m-0 text-[22px]">Condiciones de acceso</h2>
          <p className="m-0 mt-1 text-[15px] text-tinta-suave">Se definen para esta grabación. Cada acceso guarda las condiciones con que se otorgó: cambiarlas después no modifica los ya otorgados. Dejar de venderla no quita el acceso a quien ya lo tiene.</p>
          <form action={guardarCondicionesGrabacion} className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
            <input type="hidden" name="taller" value={t.id} />
            <input type="hidden" name="grabacion" value={g.id} />
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 font-bold">Acceso incluido en la inscripción al taller</legend>
              {([['sin_definir', 'Sin definir todavía'], ['dias', 'Durante una cantidad de días'], ['sin_vencimiento', 'Sin vencimiento']] as const).map(([v, texto]) => (
                <label key={v} className="flex min-h-[36px] items-center gap-2.5"><input type="radio" name="incluido" value={v} defaultChecked={opcion(c.incluidoSinVencimiento, c.incluidoDias) === v} className="h-5 w-5 accent-[#4E6049]" />{texto}</label>
              ))}
              <label className="flex flex-col gap-1 text-[15px]">Días<input name="incluidoDias" inputMode="numeric" defaultValue={c.incluidoDias ?? ''} className={campo} /></label>
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 font-bold">Venta posterior (Fase 6)</legend>
              <label className="flex min-h-[36px] items-center gap-2.5"><input type="checkbox" name="aLaVenta" value="si" defaultChecked={c.aLaVenta} className="h-5 w-5 accent-[#4E6049]" />Marcar para la venta</label>
              <label className="flex flex-col gap-1 text-[15px]">Precio en USD<input name="precio" inputMode="decimal" defaultValue={c.precioCentavos ? centavosATexto(c.precioCentavos) : ''} placeholder="A definir" className={campo} /></label>
              {([['sin_definir', 'Duración sin definir'], ['dias', 'Acceso por una cantidad de días'], ['sin_vencimiento', 'Acceso sin vencimiento']] as const).map(([v, texto]) => (
                <label key={v} className="flex min-h-[36px] items-center gap-2.5"><input type="radio" name="compra" value={v} defaultChecked={opcion(c.compraSinVencimiento, c.compraDias) === v} className="h-5 w-5 accent-[#4E6049]" />{texto}</label>
              ))}
              <label className="flex flex-col gap-1 text-[15px]">Días<input name="compraDias" inputMode="numeric" defaultValue={c.compraDias ?? ''} className={campo} /></label>
              <p className="m-0 text-[14px] text-tinta-suave">La venta no está habilitada: requiere pasarela de pago y alojamiento de video.</p>
            </fieldset>
            <div className="md:col-span-2"><button type="submit" className="min-h-[46px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">Guardar condiciones</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
