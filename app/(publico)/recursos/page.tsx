import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { articulosPublicados } from '@/datos/publico';
import { extracto } from '@/dominio/articulo';

export const metadata: Metadata = {
  title: 'Recursos',
  description: 'Artículos sobre Montessori, crianza y primera infancia.',
  alternates: { canonical: '/recursos' },
};


// Oculta hasta que haya artículos publicados: sin artículos, la página no existe.
export default async function Recursos() {
  const articulos = await articulosPublicados();
  if (articulos.length === 0) notFound();
  return (
    <section aria-labelledby="titulo">
      <div className="mx-auto max-w-[860px] px-[clamp(20px,4vw,56px)] py-[clamp(56px,7vw,96px)]">
        <h1 id="titulo" className="m-0 text-[clamp(36px,4vw,56px)]">Recursos</h1>
        <ul className="m-0 mt-10 flex list-none flex-col gap-4 p-0">
          {articulos.map((a) => (
            <li key={a.slug} className="rounded-xl bg-arena p-6">
              {a.categoria && <p className="m-0 text-[15px] text-tinta-suave">{a.categoria}</p>}
              <h2 className="m-0 mt-1 text-2xl">
                <Link href={`/recursos/${a.slug}`} className="text-marron no-underline hover:underline">{a.titulo}</Link>
              </h2>
              <p className="m-0 mt-2 text-base">{a.resumen ?? extracto(a.cuerpo)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
