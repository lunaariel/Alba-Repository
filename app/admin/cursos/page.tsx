import type { Metadata } from 'next';
import { EnPreparacion } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Cursos' };

export default function Cursos() {
  return (
    <EnPreparacion
      titulo="Cursos"
      entrega={2}
      queHara={[
        'Crear, editar, duplicar y archivar cursos, con su precio en USD.',
        'Armar el temario: módulos y lecciones, con video y materiales PDF.',
        'Escribir la evaluación final: preguntas, respuestas correctas, temas, puntaje mínimo e intentos.',
        'Publicar con una lista que muestra qué falta, y ver el curso como lo verá un alumno.',
      ]}
    />
  );
}
