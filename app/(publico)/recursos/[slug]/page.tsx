import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articulosPublicados } from '@/datos/publico';
import { extracto, leerArticulo } from '@/dominio/articulo';
import { CuerpoArticulo } from '@/ui/contenido';

type Props = { params: Promise<{ slug: string }> };

async function articulo(slug: string) {
  return (await articulosPublicados()).find((a) => a.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await articulo((await params).slug);
  if (!a) return { title: 'Artículo no encontrado' };
  return {
    title: a.titulo,
    description: a.resumen ?? extracto(a.cuerpo),
    alternates: { canonical: `/recursos/${a.slug}` },
    openGraph: { type: 'article', publishedTime: a.publicadoEn.toISOString() },
  };
}


export default async function Articulo({ params }: Props) {
  const a = await articulo((await params).slug);
  if (!a) notFound();
  const fecha = new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'America/Guatemala' }).format(a.publicadoEn);
  return (
    <article className="mx-auto max-w-[860px] px-[clamp(20px,4vw,56px)] py-[clamp(56px,7vw,96px)]">
      <p className="m-0 text-[15px] text-tinta-suave"><time dateTime={a.publicadoEn.toISOString()}>{fecha}</time></p>
      <h1 className="m-0 mt-2 text-[clamp(36px,4vw,52px)] leading-[1.1]">{a.titulo}</h1>
      <div className="mt-8"><CuerpoArticulo bloques={leerArticulo(a.cuerpo)} /></div>
    </article>
  );
}
