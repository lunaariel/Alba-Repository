import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Contenido' };

export default function Contenido() {
  return (
    <EnPreparacion
      titulo="Contenido"
      entrega={5}
      queHara={[
        'Editar los textos del sitio: inicio, la maestra, preguntas frecuentes y páginas legales.',
        'Escribir y publicar artículos del blog, con vista previa; archivarlos sin perderlos.',
      ]}
    />
  );
}
