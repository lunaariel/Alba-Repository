import type { Metadata } from 'next';
import Link from 'next/link';
import { misCompras } from '@/datos/campus';
import { formatearUSD } from '@/dominio/dinero';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { EnlaceAccion } from '@/ui/acciones';

export const metadata: Metadata = { title: 'Compras' };

const ESTADO: Record<string, string> = { aprobada: 'Pagada', reembolsada: 'Reembolsada', contracargo: 'En disputa con el banco' };
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' }).format(d);

export default async function Compras() {
  const compras = await misCompras();
  return (
    <>
      <EncabezadoCampus titulo="Compras" bajada="Sus pagos y comprobantes. Los montos están en dólares estadounidenses (USD)." />
      <Contenedor className="pb-20 pt-2">
        {compras.length === 0 ? (
          <div className="max-w-[640px] rounded-2xl bg-arena p-8">
            <p className="m-0 font-display text-2xl">Todavía no tiene compras.</p>
            <div className="mt-4"><EnlaceAccion href="/cursos">Ver los cursos</EnlaceAccion></div>
          </div>
        ) : (
          <ul className="m-0 flex max-w-[860px] list-none flex-col gap-4 p-0">
            {compras.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
                <div className="min-w-0 flex-[1_1_320px]">
                  <p className="m-0 text-[15px] text-tinta-suave">{fecha(c.fecha)} · {ESTADO[c.estado] ?? c.estado}</p>
                  <p className="m-0 mt-1 font-bold">{c.items.map((i) => i.descripcion).join(', ')}</p>
                </div>
                <p className="m-0 font-display text-[24px] font-semibold">{formatearUSD(c.totalCentavos)}</p>
                <Link href={`/campus/compras/${c.id}`} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo underline underline-offset-4">
                  Ver comprobante
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 mt-8 max-w-[44em] text-[15px] text-tinta-suave">
          Por ahora entregamos recibos comerciales, que no son facturas. Si necesita factura, escríbanos desde{' '}
          <Link href="/contacto" className="text-oliva-profundo">contacto</Link>.
        </p>
      </Contenedor>
    </>
  );
}
