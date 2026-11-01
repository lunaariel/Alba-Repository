import type { Metadata } from 'next';
import Link from 'next/link';
import { EnPreparacion } from '@/ui/admin/estructura';
import { exigirAdmin } from '@/datos/sesion';

export const metadata: Metadata = { title: 'Ventas' };

// Verificación propia además del layout: el contenido no viaja en la respuesta 404 a quien no es admin.
export default async function Ventas() {
  await exigirAdmin();
  return (
    <>
    <EnPreparacion
      titulo="Ventas"
      entrega={6}
      queHara={[
        'Ver órdenes y pagos con su estado y su recibo.',
        'Registrar reembolsos: al confirmarse, se revoca solo el período de acceso de esa compra (otras compras y becas siguen).',
        'Crear y desactivar cupones.',
      ]}
      mientras="Los cobros reales, los reembolsos en la pasarela y la factura FEL llegan con la Fase 6. Las ventas siguen cerradas hasta entonces."
    />
    <p className="m-0 mt-6 max-w-[860px] text-[15px]">
      Pagos y accesos que necesitan revisión: <Link href="/admin/talleres/incidencias" className="font-bold text-oliva-profundo">Incidencias</Link>.
      Las becas se otorgan desde la sección Alumnos de cada curso.
    </p>
    </>
  );
}
