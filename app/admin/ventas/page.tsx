import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Ventas' };

export default function Ventas() {
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
