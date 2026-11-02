import type { Metadata } from 'next';
import Link from 'next/link';
import { ESTADOS_ORDEN, ventasPanel, type EstadoOrden } from '@/datos/admin-consultas';
import { exigirAdmin } from '@/datos/sesion';
import { formatearUSD } from '@/dominio/dinero';
import { INSCRIPCIONES_ABIERTAS } from '@/config/comercio';
import { CabeceraAdmin, EstadoChip, type Estado } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Ventas' };

const TEXTO: Record<EstadoOrden, { chip: Estado; texto: string }> = {
  pendiente: { chip: 'pendiente', texto: 'Pendiente de pago' }, aprobada: { chip: 'publicado', texto: 'Pagada' },
  rechazada: { chip: 'error', texto: 'Pago rechazado' }, cancelada: { chip: 'archivado', texto: 'Cancelada' }, vencida: { chip: 'archivado', texto: 'Vencida sin pagar' },
  reembolsada: { chip: 'archivado', texto: 'Reembolsada' }, contracargo: { chip: 'error', texto: 'Contracargo' }, requiere_reembolso: { chip: 'pendiente', texto: 'Requiere reembolso' },
};
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(d);

type Props = { searchParams: Promise<{ estado?: string }> };

// Solo lectura. Con la pasarela simulada, todo lo que aparece aquí es de prueba: no hubo cobros reales.
export default async function Ventas({ searchParams }: Props) {
  await exigirAdmin();
  const { estado: e } = await searchParams;
  const estado = (ESTADOS_ORDEN as readonly string[]).includes(e ?? '') ? (e as EstadoOrden) : null;
  const ventas = await ventasPanel(estado);
  const simuladas = ventas.some((v) => v.pagos.some((p) => p.proveedor === 'simulado'));
  return (
    <>
      <CabeceraAdmin titulo="Ventas" bajada="Órdenes de cursos y talleres con su estado. Solo consulta: los reembolsos se registran cuando la pasarela los confirma." />
      {!INSCRIPCIONES_ABIERTAS && (
        <p role="status" className="m-0 mb-4 max-w-[860px] rounded-xl bg-arena p-4 text-[15px]">
          <b>Las ventas están cerradas.</b> {simuladas ? 'Las órdenes con pago «simulado» son de prueba: no hubo cobros reales.' : 'No hay pasarela conectada.'}
        </p>
      )}
      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {[null, ...ESTADOS_ORDEN].map((x) => (
          <Link key={x ?? 'todas'} href={x ? `/admin/ventas?estado=${x}` : '/admin/ventas'} aria-current={x === estado ? 'page' : undefined}
            className={`inline-flex min-h-[40px] items-center rounded-full border-[1.5px] px-4 text-[14px] font-bold no-underline ${x === estado ? 'border-oliva-profundo bg-oliva-profundo text-marfil' : 'border-borde-bandeja bg-blanco-calido text-marron hover:bg-arena'}`}>
            {x ? TEXTO[x].texto : 'Todas'}
          </Link>
        ))}
      </nav>
      {ventas.length === 0 ? (
        <div className="mt-4 max-w-[720px] rounded-2xl bg-arena p-6"><p className="m-0">{estado ? 'No hay órdenes en ese estado.' : 'Todavía no hay órdenes.'}</p></div>
      ) : (
        <ul className="m-0 mt-4 flex max-w-[1000px] list-none flex-col gap-3 p-0">
          {ventas.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4">
              <div className="min-w-0 flex-[1_1_320px]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <EstadoChip estado={TEXTO[v.estado].chip} texto={TEXTO[v.estado].texto} />
                  <p className="m-0 font-bold">{v.items.join(', ') || 'Orden sin ítems'}</p>
                </div>
                <p className="m-0 mt-1 text-[14px] text-tinta-suave">
                  {v.persona} · {fecha(v.fecha)}{v.pagos.some((p) => p.proveedor === 'simulado') ? ' · pago simulado' : ''}
                </p>
              </div>
              <p className="m-0 font-display text-[22px]">{formatearUSD(v.totalCentavos)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 mt-6 max-w-[860px] text-[15px]">
        Pagos y accesos que necesitan revisión: <Link href="/admin/talleres/incidencias" className="font-bold text-oliva-profundo">Incidencias</Link>.
        Las becas se otorgan desde la pestaña Alumnos de cada curso.
      </p>
    </>
  );
}
