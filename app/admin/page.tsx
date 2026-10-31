import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';
import { EnlaceAccion } from '@/ui/acciones';
import { exigirAdmin } from '@/datos/sesion';

export const metadata: Metadata = { title: 'Hoy' };

// Verificación propia además del layout: el contenido no viaja en la respuesta 404 a quien no es admin.
export default async function Hoy() {
  await exigirAdmin();
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
