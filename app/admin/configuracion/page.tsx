import type { Metadata } from 'next';
import Link from 'next/link';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Configuración' };

export default function Configuracion() {
  return (
    <>
      <CabeceraAdmin titulo="Configuración" />
      <div className="grid max-w-[1000px] gap-5 md:grid-cols-2">
        <section aria-labelledby="actividad" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="actividad" className="m-0 text-[22px]">Registro de actividad</h2>
            <EstadoChip estado="publicado" texto="Disponible" />
          </div>
          <p className="m-0 mt-2">Quién cambió qué y cuándo, con el antes y el después. Nadie puede editarlo ni borrarlo.</p>
          <Link href="/admin/configuracion/actividad" className="mt-4 inline-flex min-h-[44px] items-center rounded-sm bg-oliva-profundo px-[18px] font-bold text-marfil no-underline hover:bg-marron">
            Abrir el registro
          </Link>
        </section>
        <section aria-labelledby="academia" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="academia" className="m-0 text-[22px]">Academia y ventas</h2>
            <EstadoChip estado="pendiente" texto="Entrega 6" />
          </div>
          <p className="m-0 mt-2">Nombre, correo y WhatsApp de contacto, zona horaria, apertura de inscripciones y estado de cada integración.</p>
          <p className="m-0 mt-3 text-[15px] text-tinta-suave">Las inscripciones solo podrán abrirse con la pasarela, la factura FEL y la política de reembolsos listas.</p>
        </section>
      </div>
    </>
  );
}
