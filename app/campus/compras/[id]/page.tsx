import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { compra, miPerfil } from '@/datos/campus';
import { configuracion } from '@/datos/publico';
import { formatearUSD } from '@/dominio/dinero';
import { LEYENDA_NO_FISCAL } from '@/servicios/facturacion/solo-recibo';
import { Contenedor } from '@/ui/estructura';
import { EnlaceAccion } from '@/ui/acciones';
import { BotonImprimir } from './BotonImprimir';

export const metadata: Metadata = { title: 'Comprobante' };

const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' }).format(d);

/** Recibo comercial imprimible. No es una factura y lo dice en el encabezado y al pie. */
export default async function Comprobante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, perfil, config] = await Promise.all([compra(id), miPerfil(), configuracion()]);
  if (!c) notFound();
  const numero = c.recibo?.numero ?? `R-${c.id.slice(0, 8).toUpperCase()}`;
  return (
    <Contenedor className="pb-20 pt-[clamp(24px,4vw,44px)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <EnlaceAccion href="/campus/compras">← Compras</EnlaceAccion>
        <BotonImprimir />
      </div>
      <article className="max-w-[760px] rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-[clamp(24px,4vw,44px)] print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-borde-bandeja pb-5">
          <div>
            <p className="m-0 font-display text-[26px] font-semibold">{config.nombre}</p>
            <p className="m-0 text-[15px] text-tinta-suave">Recibo comercial · no es factura</p>
          </div>
          <div className="text-right">
            <p className="m-0 font-bold">Recibo {numero}</p>
            <p className="m-0 text-[15px] text-tinta-suave">{fecha(c.fecha)}</p>
          </div>
        </header>
        <p className="m-0 mt-5"><span className="text-tinta-suave">Cliente: </span>{perfil.nombre} · {perfil.correo}</p>
        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-borde-bandeja text-[15px] text-tinta-suave">
              <th scope="col" className="py-2 font-normal">Concepto</th>
              <th scope="col" className="py-2 text-right font-normal">Importe</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((i, n) => (
              <tr key={n} className="border-b border-borde-bandeja">
                <td className="py-3 pr-4">{i.descripcion}</td>
                <td className="py-3 text-right">{formatearUSD(i.precioCentavos)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-4 text-left">Total pagado</th>
              <td className="pt-4 text-right font-display text-[24px] font-semibold">{formatearUSD(c.totalCentavos)}</td>
            </tr>
          </tfoot>
        </table>
        {c.factura?.estado === 'emitido' && (
          <p className="m-0 mt-4">Factura electrónica (FEL): serie {c.factura.serie} · número {c.factura.numero}</p>
        )}
        {c.estado === 'reembolsada' && <p className="m-0 mt-4 font-bold text-error">Esta compra fue reembolsada.</p>}
        <p className="m-0 mt-8 border-t border-borde-bandeja pt-4 text-[15px] text-tinta-suave">{LEYENDA_NO_FISCAL}</p>
      </article>
    </Contenedor>
  );
}
