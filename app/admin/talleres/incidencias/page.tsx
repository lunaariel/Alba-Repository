import type { Metadata } from 'next';
import Link from 'next/link';
import { listaIncidencias, notificacionesPendientes } from '@/datos/admin-talleres';
import { formatearUSD } from '@/dominio/dinero';
import { AvisoAccion } from '@/ui/admin/campos';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';
import { TEXTOS_TALLER } from '@/ui/admin/talleres';
import { anotarIncidencia, reintentarOtorgamiento, resolverReembolsoParcial } from '../acciones';

export const metadata: Metadata = { title: 'Incidencias' };

const TIPOS: Record<string, string> = {
  pago_sin_cupo: 'Pago recibido sin lugar disponible: requiere reembolso',
  reembolso_por_cancelacion: 'Taller cancelado con inscripción paga: reembolso pendiente',
  reembolso_por_reprogramacion: 'Taller reprogramado: la persona pidió la devolución',
  otorgamiento_fallido: 'Pago confirmado sin acceso otorgado: reintentar',
  pago_sin_condiciones: 'Pago de una orden sin condiciones registradas: no se otorgó acceso, decida cómo seguir',
  compra_con_acceso_vigente: 'Compra confirmada con un acceso vigente: el período nuevo se encadenó, decida si mantenerlo o reembolsarlo',
  orden_sin_condiciones: 'Orden antigua sin condiciones registradas: se dio por vencida, revisar',
  reembolso_parcial: 'Reembolso parcial confirmado: pendiente de revisión administrativa (el acceso se mantiene)',
  revisar_periodos: 'Se revocó un período con otro encadenado después: revise las fechas',
};
const MOTIVOS: Record<string, string> = {
  sin_cupo: 'la reserva había vencido y el cupo ya estaba completo', taller_cancelado: 'el taller ya estaba cancelado',
  taller_empezado: 'el taller ya había empezado', orden_cancelada: 'la orden estaba cancelada', taller_finalizado: 'el taller ya había terminado',
  taller_archivado: 'el taller estaba archivado',
};
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(d);

export default async function Incidencias({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [incidencias, pendientes, aviso] = await Promise.all([listaIncidencias(), notificacionesPendientes(), searchParams]);
  return (
    <>
      <CabeceraAdmin titulo="Incidencias" migas={[{ href: '/admin/talleres', texto: 'Talleres' }]}
        bajada="Pagos, accesos y talleres que necesitan su atención. Ningún reembolso figura como hecho hasta que la pasarela de pago lo confirme (Fase 6)." />
      <AvisoAccion ok={aviso.ok} error={aviso.error} textos={TEXTOS_TALLER} />
      <p className="m-0 mb-6 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
        Avisos a participantes registrados y pendientes de envío: <b>{pendientes}</b>. Todavía no hay servicio de correo conectado: ninguno figura como enviado.
      </p>
      {incidencias.length === 0 ? (
        <div className="max-w-[860px] rounded-2xl bg-arena p-6"><p className="m-0">No hay incidencias.</p></div>
      ) : (
        <ul className="m-0 flex max-w-[980px] list-none flex-col gap-3 p-0">
          {incidencias.map((i) => (
            <li key={i.id} className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <EstadoChip estado={i.estado === 'abierta' ? 'error' : i.estado === 'en_revision' ? 'pendiente' : 'publicado'}
                  texto={i.estado === 'abierta' ? 'Abierta' : i.estado === 'en_revision' ? 'En revisión' : 'Resuelta'} />
                <h2 className="m-0 font-texto text-[17px] font-bold">{TIPOS[i.tipo]}</h2>
              </div>
              <p className="m-0 mt-2 text-[15px]">
                {i.persona ?? 'Persona sin nombre'}{i.correo ? ` (${i.correo})` : ''}
                {i.taller && <> · <Link href={`/admin/talleres/${i.taller.id}`} className="font-bold text-oliva-profundo">{i.taller.titulo}</Link></>}
                {i.orden && <> · orden {i.orden.estado === 'requiere_reembolso' ? 'en «requiere reembolso»' : `«${i.orden.estado}»`} por {formatearUSD(i.orden.total)}</>}
              </p>
              <p className="m-0 mt-1 text-[14px] text-tinta-suave">
                {fecha(i.creadoEn)}{typeof i.detalle.motivo === 'string' && MOTIVOS[i.detalle.motivo] ? ` · El pago llegó cuando ${MOTIVOS[i.detalle.motivo]}.` : ''}
                {typeof i.detalle.pago_externo === 'string' && ` · Pago ${i.detalle.pago_externo}`}
              </p>
              {i.nota && <p className="m-0 mt-2 text-[15px]"><b>Nota:</b> {i.nota}</p>}
              {i.tipo === 'reembolso_parcial' && (
                <div className="mt-3 rounded-xl bg-arena px-4 py-3 text-[15px]">
                  <p className="m-0">
                    Importe original {typeof i.detalle.importe_original_centavos === 'number' ? formatearUSD(i.detalle.importe_original_centavos) : '—'} ·
                    reembolsado {typeof i.detalle.reembolsado_centavos === 'number' ? formatearUSD(i.detalle.reembolsado_centavos) : '—'}
                    {i.detalle.excede_lo_pagado === true ? ' · un aviso posterior excedía lo pagado y no se registró' : ''}
                  </p>
                  <p className="m-0 mt-1 text-[14px] text-tinta-suave">El acceso no cambia por un reembolso parcial. La política para estos casos todavía no está aprobada: registre aquí su resolución cuando la tenga.</p>
                  {i.estado !== 'resuelta' && (
                    <form action={resolverReembolsoParcial} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={i.id} />
                      <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-1 text-[14px] font-bold">Resolución (no modifica el acceso)
                        <input name="resolucion" required minLength={20} maxLength={1000} className="min-h-[44px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 font-normal text-marron" />
                      </label>
                      <button type="submit" className="min-h-[44px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-4 font-bold text-oliva-profundo hover:bg-arena">Registrar resolución</button>
                    </form>
                  )}
                </div>
              )}
              {i.tipo === 'otorgamiento_fallido' && i.estado !== 'resuelta' && (
                <form action={reintentarOtorgamiento} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={i.id} />
                  <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-1 text-[14px] font-bold">Nota del reintento
                    <input name="nota" required minLength={5} maxLength={1000} className="min-h-[44px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 font-normal text-marron" />
                  </label>
                  <button type="submit" className="min-h-[44px] rounded-md bg-oliva-profundo px-4 font-bold text-marfil hover:bg-marron">Reintentar otorgamiento</button>
                </form>
              )}
              <form action={anotarIncidencia} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={i.id} />
                <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-1 text-[14px] font-bold">Nota interna
                  <input name="nota" required minLength={5} maxLength={1000} className="min-h-[44px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 font-normal text-marron" />
                </label>
                <button type="submit" className="min-h-[44px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-4 font-bold text-oliva-profundo hover:bg-arena">Guardar nota</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
