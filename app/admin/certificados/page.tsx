import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';
import { exigirAdmin } from '@/datos/sesion';

export const metadata: Metadata = { title: 'Certificados' };

// Verificación propia además del layout: el contenido no viaja en la respuesta 404 a quien no es admin.
export default async function Certificados() {
  await exigirAdmin();
  return (
    <EnPreparacion
      titulo="Certificados"
      entrega={4}
      queHara={[
        'Buscar certificados por código, alumno o curso.',
        'Descargar o volver a generar el PDF.',
        'Revocar un certificado con motivo: la verificación pública deja de mostrarlo como vigente.',
      ]}
    />
  );
}
