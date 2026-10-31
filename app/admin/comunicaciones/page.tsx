import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';
import { exigirAdmin } from '@/datos/sesion';

export const metadata: Metadata = { title: 'Comunicaciones' };

// Verificación propia además del layout: el contenido no viaja en la respuesta 404 a quien no es admin.
export default async function Comunicaciones() {
  await exigirAdmin();
  return (
    <EnPreparacion
      titulo="Comunicaciones"
      entrega={5}
      queHara={[
        'Leer los mensajes del formulario de contacto y marcarlos como respondidos.',
        'Editar las plantillas de correo con vista previa.',
        'Ver el historial de correos enviados.',
      ]}
      mientras="El envío real de correos llega al conectar el servicio de correo (Fase 6)."
    />
  );
}
