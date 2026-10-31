import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';
import { exigirAdmin } from '@/datos/sesion';

export const metadata: Metadata = { title: 'Ventas' };

// Verificación propia además del layout: el contenido no viaja en la respuesta 404 a quien no es admin.
export default async function Ventas() {
  await exigirAdmin();
  return (
    <EnPreparacion
      titulo="Ventas"
      entrega={6}
      queHara={[
        'Ver órdenes y pagos con su estado y su recibo.',
        'Registrar reembolsos: al confirmarse, el acceso al curso se revoca automáticamente.',
        'Crear y desactivar cupones.',
      ]}
      mientras="Los cobros reales, los reembolsos en la pasarela y la factura FEL llegan con la Fase 6. Las ventas siguen cerradas hasta entonces."
    />
  );
}
