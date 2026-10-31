import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Talleres' };

export default function Talleres() {
  return (
    <EnPreparacion
      titulo="Talleres"
      entrega={3}
      queHara={[
        'Crear, publicar, reprogramar, cancelar y duplicar talleres (la copia queda en borrador, sin inscriptos ni enlaces).',
        'Fijar fecha, hora, cupo y precio; el cupo nunca baja de los inscriptos confirmados.',
        'Cargar el enlace de la videollamada y elegir recordatorios.',
        'Ver y exportar la lista de inscriptos.',
      ]}
      mientras="La creación automática de reuniones en Zoom o Meet y el envío de recordatorios llegan al conectar esos servicios (Fase 6)."
    />
  );
}
