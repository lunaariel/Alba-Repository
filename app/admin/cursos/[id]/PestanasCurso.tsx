'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function PestanasCurso({ id }: { id: string }) {
  const ruta = usePathname();
  const base = `/admin/cursos/${id}`;
  const pestanas = [
    { href: base, texto: 'Datos y precio', activa: ruta === base },
    { href: `${base}/temario`, texto: 'Temario', activa: ruta.startsWith(`${base}/temario`) },
    { href: `${base}/evaluacion`, texto: 'Evaluación', activa: ruta.startsWith(`${base}/evaluacion`) },
    { href: `${base}/publicacion`, texto: 'Publicación', activa: ruta.startsWith(`${base}/publicacion`) },
  ];
  return (
    <nav aria-label="Partes del curso" className="mb-6 flex gap-1 overflow-x-auto border-b-[1.5px] border-borde-bandeja">
      {pestanas.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.activa ? 'page' : undefined}
          className="shrink-0 whitespace-nowrap px-4 py-3 text-[16px] text-tinta-suave no-underline hover:text-marron aria-[current=page]:font-bold aria-[current=page]:text-marron aria-[current=page]:shadow-[inset_0_-3px_0_#4E6049]"
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
