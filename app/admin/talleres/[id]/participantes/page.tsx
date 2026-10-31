import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tallerAdmin, type InscripcionAdmin } from '@/datos/admin-talleres';
import { ESTADOS_INSCRIPCION } from '@/dominio/talleres';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoChip } from '@/ui/admin/estructura';
import { TEXTOS_TALLER } from '@/ui/admin/talleres';
import { RESPUESTAS_TEXTO } from '@/dominio/talleres-admin';
import { marcarAsistencia } from '../../acciones';

export const metadata: Metadata = { title: 'Participantes' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const ORIGEN = { compra: 'Pago', gratuita: 'Gratuita', cortesia: 'Cortesía (registrada antes del cambio a cupones)' } as const;
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(d);

/** Una tarjeta por persona: la inscripción más reciente arriba, las anteriores como historial. */
function porPersona(lista: InscripcionAdmin[]): [InscripcionAdmin, InscripcionAdmin[]][] {
  const grupos = new Map<string, InscripcionAdmin[]>();
  for (const i of [...lista].sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime())) grupos.set(i.perfilId, [...(grupos.get(i.perfilId) ?? []), i]);
  return [...grupos.values()].flatMap((g) => (g[0] ? [[g[0], g.slice(1)] as [InscripcionAdmin, InscripcionAdmin[]]] : []));
}

function Estado({ i }: { i: InscripcionAdmin }) {
  if (i.estado === 'confirmada' && i.respuesta === 'pendiente') return <EstadoChip estado="pendiente" texto="Pendiente de respuesta" />;
  const texto = i.estado === 'cancelada' && i.canceladaPor ? `Cancelada por ${i.canceladaPor === 'alumno' ? 'la persona' : 'la academia'}`
    : i.respuesta === 'reembolso_solicitado' ? 'Pidió reembolso' : ESTADOS_INSCRIPCION[i.estado] ?? i.estado;
  return (
    <>
      <EstadoChip estado={i.estado === 'confirmada' ? 'publicado' : i.estado === 'reembolso_pendiente' ? 'error' : 'archivado'} texto={texto} />
      {i.respuesta && i.respuesta !== 'pendiente' && <span className="ml-2 text-[14px] text-tinta-suave">{RESPUESTAS_TEXTO[i.respuesta]}</span>}
    </>
  );
}

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
            {t.pendientesRespuesta > 0 && <EstadoChip estado="pendiente" texto={`${t.pendientesRespuesta} sin responder a la reprogramación`} />}
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
              {porPersona(t.inscripciones).map(([actual, anteriores]) => (
                <li key={actual.id} className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4 text-[15px] md:grid-cols-[1.4fr_1fr_1.4fr]">
                  <div className="min-w-0">
                    <p className="m-0 font-bold">{actual.nombre}</p>
                    <p className="m-0 break-words text-tinta-suave">{actual.correo ?? 'sin correo'}</p>
                  </div>
                  <div>
                    <Estado i={actual} />
                    <p className="m-0 mt-1 text-tinta-suave">{ORIGEN[actual.origen]} · {fecha(actual.creadoEn)}{actual.ordenEstado === 'requiere_reembolso' ? ' · orden: requiere reembolso' : ''}</p>
                    {actual.motivo && <p className="m-0 text-tinta-suave">Motivo: {actual.motivo}</p>}
                  </div>
                  <div><span className="sr-only">Asistencia: </span><Asistencia i={actual} taller={t.id} empezo={empezo} /></div>
                  {anteriores.length > 0 && (
                    <details className="text-[14px] text-tinta-suave md:col-span-3">
                      <summary className="cursor-pointer font-bold text-oliva-profundo">Historial ({anteriores.length === 1 ? '1 inscripción anterior' : `${anteriores.length} inscripciones anteriores`})</summary>
                      <ul className="m-0 mt-1 list-disc pl-5">
                        {anteriores.map((x) => (
                          <li key={x.id}>{ESTADOS_INSCRIPCION[x.estado] ?? x.estado}{x.canceladaPor ? ` por ${x.canceladaPor === 'alumno' ? 'la persona' : 'la academia'}` : ''} · {ORIGEN[x.origen]} · {fecha(x.creadoEn)}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="invitaciones" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h2 id="invitaciones" className="m-0 text-[22px]">Invitaciones</h2>
          <p className="m-0 mt-2 text-[15px]">Las invitaciones a talleres pagos se harán con cupones de descuento, cuando se conecte el sistema de pagos (Fase 6). Ya no se crean inscripciones manuales por cortesía.</p>
          <p className="m-0 mt-2 text-[15px] text-tinta-suave">Las cortesías registradas antes de este cambio se conservan con su motivo e historial.</p>
        </section>
      </div>
    </>
  );
}
