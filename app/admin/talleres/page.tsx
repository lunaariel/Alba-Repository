import type { Metadata } from 'next';
import Link from 'next/link';
import { listaIncidencias, listaTalleres, type TallerListado } from '@/datos/admin-talleres';
import { formatearUSD } from '@/dominio/dinero';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoTallerChip, FechaGrande, horarioTaller, lugares, TEXTOS_TALLER } from '@/ui/admin/talleres';
import { NuevoTaller } from './NuevoTaller';

export const metadata: Metadata = { title: 'Talleres' };

function Fila({ t }: { t: TallerListado }) {
  const ocupados = t.confirmadas + t.reservas;
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4">
      <FechaGrande inicio={t.iniciaEn} zona={t.zonaHoraria} />
      <div className="min-w-0 flex-[1_1_300px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <EstadoTallerChip estado={t.estado} />
          <h3 className="m-0 font-texto text-[18px] font-bold">
            <Link href={`/admin/talleres/${t.id}`} className="text-marron no-underline hover:underline">{t.titulo}</Link>
          </h3>
        </div>
        <p className="m-0 mt-1 text-[14px] text-tinta-suave">
          {horarioTaller(t.iniciaEn, t.zonaHoraria)} · {t.precioCentavos > 0 ? formatearUSD(t.precioCentavos) : 'Gratuito'} · {lugares(t.cupo, ocupados)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {t.estado === 'publicado' && t.sinEnlace && <EstadoChip estado="pendiente" texto="Sin enlace de videollamada" />}
          {t.pendientesRespuesta > 0 && <EstadoChip estado="pendiente" texto={`${t.pendientesRespuesta} sin responder a la reprogramación`} />}
          {t.reembolsosPendientes > 0 && <EstadoChip estado="error" texto={`${t.reembolsosPendientes} ${t.reembolsosPendientes === 1 ? 'reembolso pendiente' : 'reembolsos pendientes'}`} />}
        </div>
      </div>
      <Link href={`/admin/talleres/${t.id}`} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo underline underline-offset-4">Abrir</Link>
    </li>
  );
}

function Grupo({ titulo, talleres, vacio }: { titulo: string; talleres: TallerListado[]; vacio?: string }) {
  if (!talleres.length && !vacio) return null;
  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <h2 className="m-0 text-[22px]">{titulo}</h2>
      {talleres.length ? <ul className="m-0 flex list-none flex-col gap-3 p-0">{talleres.map((t) => <Fila key={t.id} t={t} />)}</ul>
        : <p className="m-0 rounded-2xl bg-arena p-5">{vacio}</p>}
    </section>
  );
}

export default async function Talleres({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [talleres, incidencias, aviso] = await Promise.all([listaTalleres(), listaIncidencias(), searchParams]);
  const ahora = Date.now();
  const proximos = talleres.filter((t) => t.estado === 'publicado' && t.terminaEn.getTime() >= ahora);
  const borradores = talleres.filter((t) => t.estado === 'borrador');
  const resto = talleres.filter((t) => !proximos.includes(t) && !borradores.includes(t)).reverse();
  const realizados = resto.filter((t) => t.estado === 'finalizado' || t.estado === 'publicado');
  const cancelados = resto.filter((t) => t.estado === 'cancelado');
  const archivados = resto.filter((t) => t.estado === 'archivado');
  const abiertas = incidencias.filter((i) => i.estado !== 'resuelta').length;
  return (
    <>
      <CabeceraAdmin titulo="Talleres" bajada="Talleres en vivo por videollamada: fechas, cupos, inscripciones y recordatorios."
        acciones={<Link href="/admin/talleres/incidencias" className="inline-flex min-h-[44px] items-center gap-2 rounded-md border-2 border-oliva-profundo px-4 font-bold text-oliva-profundo no-underline hover:bg-arena">
          Incidencias {abiertas > 0 && <span className="rounded-full bg-error px-2 text-[13px] text-marfil">{abiertas}</span>}
        </Link>} />
      <AvisoAccion ok={aviso.ok} error={aviso.error} textos={TEXTOS_TALLER} />
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Grupo titulo="Próximos" talleres={proximos} vacio="No hay talleres publicados próximos." />
          <Grupo titulo="Borradores" talleres={borradores} />
          <Grupo titulo="Realizados" talleres={realizados} />
          <Grupo titulo="Cancelados" talleres={cancelados} />
          <Grupo titulo="Archivados" talleres={archivados} />
        </div>
        <NuevoTaller />
      </div>
    </>
  );
}
