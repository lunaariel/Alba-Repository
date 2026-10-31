import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tallerAdmin } from '@/datos/admin-talleres';
import { OPCIONES_RECORDATORIO, textoRecordatorio } from '@/dominio/talleres-admin';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoChip } from '@/ui/admin/estructura';
import { TEXTOS_TALLER } from '@/ui/admin/talleres';
import { guardarRecordatorios, guardarReunion } from '../../acciones';

export const metadata: Metadata = { title: 'Videollamada y recordatorios' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };
const campo = 'min-h-[50px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 text-marron';

export default async function Videollamada({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const t = await tallerAdmin(id);
  if (!t) notFound();
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} textos={TEXTOS_TALLER} />
      <div className="grid max-w-[1100px] grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="enlace" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h2 id="enlace" className="m-0 text-[22px]">Enlace de la videollamada</h2>
          <p className="m-0 mt-1 text-[15px] text-tinta-suave">
            Por ahora se pega a mano. La creación automática en {t.plataforma === 'zoom' ? 'Zoom' : 'Google Meet'} estará disponible al conectar ese servicio (Fase 6).
          </p>
          <div className="mt-3">
            {t.reunion?.estado === 'activa' ? <EstadoChip estado="publicado" texto="Enlace cargado" /> : <EstadoChip estado="pendiente" texto="Sin enlace" />}
          </div>
          <p className="m-0 mt-3 text-[15px]">
            Lo ven solo las personas con inscripción confirmada, desde que se confirma. No lo ven visitantes, reservas sin pagar ni inscripciones canceladas.
            El enlace de anfitrión no lo ve nadie más que usted.
          </p>
          <form action={guardarReunion} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="id" value={t.id} />
            <label htmlFor="participante" className="text-[15px] font-bold">Enlace para participantes</label>
            <input id="participante" name="participante" type="url" required defaultValue={t.reunion?.enlaceParticipante ?? ''} placeholder="https://" className={campo} />
            <label htmlFor="anfitrion" className="text-[15px] font-bold">Enlace de anfitrión (opcional, privado)</label>
            <input id="anfitrion" name="anfitrion" type="url" defaultValue={t.reunion?.enlaceAnfitrion ?? ''} placeholder="https://" className={campo} />
            <div><button type="submit" className="min-h-[46px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">Guardar enlace</button></div>
          </form>
        </section>

        <section aria-labelledby="recordatorios" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h2 id="recordatorios" className="m-0 text-[22px]">Recordatorios</h2>
          <p className="m-0 mt-1 text-[15px] text-tinta-suave">
            Se calculan siempre con la fecha vigente: si reprograma, los de la fecha anterior no se usan y cada recordatorio se registra una sola vez por persona. Quien no respondió una reprogramación recibe un aviso para responder, nunca uno que dé por confirmada la fecha nueva. Puede desmarcarlos todos.
          </p>
          <p className="m-0 mt-3 rounded-xl bg-arena px-4 py-3 text-[15px]">
            Todavía no hay servicio de correo: cada recordatorio queda <b>registrado como pendiente</b> y no figura como enviado. El envío real llega en la Fase 6.
            {t.notificaciones.pendientes + t.notificaciones.descartadas > 0 && <> Avisos de este taller: {t.notificaciones.pendientes} pendientes, {t.notificaciones.descartadas} descartados.</>}
          </p>
          <form action={guardarRecordatorios} className="mt-4 flex flex-col gap-2">
            <input type="hidden" name="id" value={t.id} />
            <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
              <legend className="mb-1 text-[15px] font-bold">Enviar recordatorio</legend>
              {OPCIONES_RECORDATORIO.map((o) => (
                <label key={o.minutos} className="flex min-h-[40px] items-center gap-2.5">
                  <input type="checkbox" name="minutos" value={o.minutos} defaultChecked={t.recordatorios.includes(o.minutos)} className="h-5 w-5 accent-[#4E6049]" />
                  {o.texto}
                </label>
              ))}
            </fieldset>
            {t.recordatorios.some((m) => !OPCIONES_RECORDATORIO.some((o) => o.minutos === m)) && (
              <p className="m-0 text-[14px] text-tinta-suave">También configurado: {t.recordatorios.filter((m) => !OPCIONES_RECORDATORIO.some((o) => o.minutos === m)).map(textoRecordatorio).join(', ')}.</p>
            )}
            {t.recordatorios.length === 0 && <p className="m-0 text-[14px] font-bold">Sin recordatorios: no se registrará ningún aviso previo.</p>}
            <div><button type="submit" className="min-h-[46px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-5 font-bold text-oliva-profundo hover:bg-arena">Guardar recordatorios</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
