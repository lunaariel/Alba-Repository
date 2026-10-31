import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tallerAdmin, type InscripcionAdmin } from '@/datos/admin-talleres';
import { ESTADOS_INSCRIPCION } from '@/dominio/talleres';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoChip } from '@/ui/admin/estructura';
import { TEXTOS_TALLER } from '@/ui/admin/talleres';
import { inscribirCortesia, marcarAsistencia } from '../../acciones';

export const metadata: Metadata = { title: 'Participantes' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const ORIGEN = { compra: 'Pago', gratuita: 'Gratuita', cortesia: 'Cortesía' } as const;
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(d);

function Asistencia({ i, taller, empezo }: { i: InscripcionAdmin; taller: string; empezo: boolean }) {
  if (i.estado !== 'confirmada') return <span className="text-tinta-suave">—</span>;
  if (!empezo) return <span className="text-tinta-suave">Después del inicio</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{i.asistio === null ? 'Sin marcar' : i.asistio ? 'Asistió' : 'No asistió'}</span>
      {(['si', 'no'] as const).map((v) => (
        <form key={v} action={marcarAsistencia}>
          <input type="hidden" name="taller" value={taller} />
          <input type="hidden" name="inscripcion" value={i.id} />
          <input type="hidden" name="asistio" value={v} />
          <button type="submit" aria-label={`${v === 'si' ? 'Asistió' : 'No asistió'}: ${i.nombre}`}
            className="min-h-[36px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-2.5 text-[14px] font-bold text-oliva-profundo hover:bg-arena">
            {v === 'si' ? 'Asistió' : 'No asistió'}
          </button>
        </form>
      ))}
    </span>
  );
}

export default async function Participantes({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const t = await tallerAdmin(id);
  if (!t) notFound();
  const empezo = t.iniciaEn.getTime() <= Date.now();
  const activas = t.inscripciones.filter((i) => i.estado === 'confirmada');
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} textos={TEXTOS_TALLER} />
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_360px]">
        <section aria-labelledby="lista" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="lista" className="m-0 text-[24px]">{activas.length === 1 ? '1 inscripción confirmada' : `${activas.length} inscripciones confirmadas`}</h2>
            {t.inscripciones.length > 0 && (
              <a href={`/admin/talleres/${t.id}/participantes/csv`} className="inline-flex min-h-[44px] items-center rounded-md border-2 border-oliva-profundo px-4 font-bold text-oliva-profundo no-underline hover:bg-arena">
                Exportar CSV
              </a>
            )}
          </div>
          {t.reservas > 0 && <p className="m-0 mb-3 text-[15px] text-tinta-suave">{t.reservas === 1 ? '1 lugar reservado' : `${t.reservas} lugares reservados`} mientras se completa un pago (vence a los 15 minutos).</p>}
          {t.inscripciones.length === 0 ? (
            <div className="rounded-2xl bg-arena p-6"><p className="m-0">Todavía no hay inscripciones.</p></div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {t.inscripciones.map((i) => (
                <li key={i.id} className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4 text-[15px] md:grid-cols-[1.4fr_1fr_1.4fr]">
                  <div className="min-w-0">
                    <p className="m-0 font-bold">{i.nombre}</p>
                    <p className="m-0 break-words text-tinta-suave">{i.correo ?? 'sin correo'}</p>
                  </div>
                  <div>
                    <EstadoChip estado={i.estado === 'confirmada' ? 'publicado' : i.estado === 'reembolso_pendiente' ? 'error' : 'archivado'} texto={ESTADOS_INSCRIPCION[i.estado] ?? i.estado} />
                    <p className="m-0 mt-1 text-tinta-suave">{ORIGEN[i.origen]} · {fecha(i.creadoEn)}{i.ordenEstado === 'requiere_reembolso' ? ' · orden: requiere reembolso' : ''}</p>
                    {i.motivo && <p className="m-0 text-tinta-suave">Motivo: {i.motivo}</p>}
                  </div>
                  <div><span className="sr-only">Asistencia: </span><Asistencia i={i} taller={t.id} empezo={empezo} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {t.estado === 'publicado' && !empezo && (
          <section aria-labelledby="cortesia" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
            <h2 id="cortesia" className="m-0 text-[22px]">Inscribir por cortesía</h2>
            <p className="m-0 mt-1 text-[15px] text-tinta-suave">Para becas o invitaciones. La persona tiene que tener cuenta. Respeta el cupo y queda registrado con el motivo.</p>
            <form action={inscribirCortesia} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="id" value={t.id} />
              <label htmlFor="correo" className="text-[15px] font-bold">Correo de la persona</label>
              <input id="correo" name="correo" type="email" required maxLength={200} className="min-h-[50px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 text-marron" />
              <label htmlFor="motivo-cortesia" className="text-[15px] font-bold">Motivo</label>
              <textarea id="motivo-cortesia" name="motivo" required minLength={10} maxLength={500} rows={2} className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 py-3 text-marron" />
              <div><button type="submit" className="min-h-[46px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">Inscribir</button></div>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
