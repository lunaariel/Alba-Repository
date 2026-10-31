import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';
import { EnlaceAccion } from '@/ui/acciones';

export const metadata: Metadata = { title: 'Hoy' };

export default function Hoy() {
  return (
    <EnPreparacion
      titulo="Hoy"
      entrega={6}
      queHara={[
        'Ver de un vistazo lo que pide atención: mensajes sin leer, cursos en borrador con lo que les falta, talleres próximos y pedidos de alumnos.',
        'Crear un curso o un taller con un clic.',
        'Ver pagos o correos con error, cuando estén conectados los servicios reales.',
      ]}
      mientras={
        <>
          <p className="m-0">Ya está disponible el registro de actividad: todo cambio importante queda anotado con su autora, la fecha y el antes y el después.</p>
          <div className="mt-2"><EnlaceAccion href="/admin/configuracion/actividad">Abrir el registro de actividad</EnlaceAccion></div>
        </>
      }
    />
  );
}
