import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Alumnos' };

export default function Alumnos() {
  return (
    <EnPreparacion
      titulo="Alumnos"
      entrega={4}
      queHara={[
        'Buscar alumnos por nombre o correo.',
        'Ver su avance lección por lección, sus intentos, certificados, talleres y compras.',
        'Conceder o revocar el acceso a un curso, siempre con un motivo.',
        'Atender pedidos de cambio de correo y de eliminación definitiva de la cuenta (distinta de darse de baja de los correos).',
      ]}
    />
  );
}
