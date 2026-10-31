import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Certificados' };

export default function Certificados() {
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
