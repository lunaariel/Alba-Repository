'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function PestanasTaller({ id }: { id: string }) {
  const ruta = usePathname();
  const base = `/admin/talleres/${id}`;
  const pestanas = [
    { href: base, texto: 'Datos y horario', activa: ruta === base },
    { href: `${base}/participantes`, texto: 'Participantes', activa: ruta.startsWith(`${base}/participantes`) },
    { href: `${base}/videollamada`, texto: 'Videollamada y recordatorios', activa: ruta.startsWith(`${base}/videollamada`) },
    { href: `${base}/grabacion`, texto: 'Grabación', activa: ruta.startsWith(`${base}/grabacion`) },
    { href: `${base}/estado`, texto: 'Estado', activa: ruta.startsWith(`${base}/estado`) },
  ];
  // En celulares chicos las pestañas se desplazan: la activa se trae a la vista y un degradado indica que hay más.
  const lista = useRef<HTMLElement>(null);
  useEffect(() => { lista.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [ruta]);
  return (
    <div className="relative mb-6">
    <nav ref={lista} aria-label="Partes del taller" className="flex gap-1 overflow-x-auto border-b-[1.5px] border-borde-bandeja pr-8">
      {pestanas.map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.activa ? 'page' : undefined}
          className="shrink-0 whitespace-nowrap px-4 py-3 text-[16px] text-tinta-suave no-underline hover:text-marron aria-[current=page]:font-bold aria-[current=page]:text-marron aria-[current=page]:shadow-[inset_0_-3px_0_#4E6049]">
          {p.texto}
        </Link>
      ))}
    </nav>
    <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-[calc(100%-2px)] w-10 bg-linear-to-l from-marfil to-transparent md:hidden" />
    </div>
  );
}
