import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Comunicaciones' };

export default function Comunicaciones() {
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
