import { notFound } from 'next/navigation';
import { tallerAdmin } from '@/datos/admin-talleres';
import { formatearUSD } from '@/dominio/dinero';
import { CabeceraAdmin } from '@/ui/admin/estructura';
import { EstadoTallerChip, horarioTaller, lugares } from '@/ui/admin/talleres';
import { PestanasTaller } from './PestanasTaller';

export default async function LayoutTaller({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await tallerAdmin(id);
  if (!t) notFound();
  return (
    <>
      <CabeceraAdmin
        titulo={t.titulo}
        migas={[{ href: '/admin/talleres', texto: 'Talleres' }]}
        bajada={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <EstadoTallerChip estado={t.estado} />
            <span>{horarioTaller(t.iniciaEn, t.zonaHoraria)}</span>
            <span>· {t.precioCentavos > 0 ? formatearUSD(t.precioCentavos) : 'Gratuito'}</span>
            <span>· {lugares(t.cupo, t.confirmadas + t.reservas)}</span>
          </span>
        }
      />
      <PestanasTaller id={t.id} />
      {children}
    </>
  );
}
