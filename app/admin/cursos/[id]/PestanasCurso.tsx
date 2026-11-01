'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function PestanasCurso({ id }: { id: string }) {
  const ruta = usePathname();
  const base = `/admin/cursos/${id}`;
  const pestanas = [
    { href: base, texto: 'Datos y precio', activa: ruta === base },
    { href: `${base}/temario`, texto: 'Temario', activa: ruta.startsWith(`${base}/temario`) },
    { href: `${base}/evaluacion`, texto: 'Evaluación', activa: ruta.startsWith(`${base}/evaluacion`) },
    { href: `${base}/alumnos`, texto: 'Alumnos', activa: ruta.startsWith(`${base}/alumnos`) },
    { href: `${base}/publicacion`, texto: 'Publicación', activa: ruta.startsWith(`${base}/publicacion`) },
    { href: `${base}/vista-previa`, texto: 'Vista previa', activa: ruta.startsWith(`${base}/vista-previa`) },
  ];
  // En pantallas angostas las pestañas se desplazan: la activa se trae a la vista y un degradado indica que hay más.
  const lista = useRef<HTMLElement>(null);
  useEffect(() => { lista.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [ruta]);
  return (
    <div className="relative mb-6">
      <nav ref={lista} aria-label="Partes del curso" className="flex gap-1 overflow-x-auto border-b-[1.5px] border-borde-bandeja pr-8">
        {pestanas.map((p) => (
          <Link key={p.href} href={p.href} aria-current={p.activa ? 'page' : undefined}
            className="shrink-0 whitespace-nowrap px-4 py-3 text-[16px] text-tinta-suave no-underline hover:text-marron aria-[current=page]:font-bold aria-[current=page]:text-marron aria-[current=page]:shadow-[inset_0_-3px_0_#4E6049]">
            {p.texto}
          </Link>
        ))}
      </nav>
      <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-[calc(100%-2px)] w-10 bg-linear-to-l from-marfil to-transparent lg:hidden" />
    </div>
  );
}
