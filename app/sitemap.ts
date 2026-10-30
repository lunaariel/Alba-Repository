import type { MetadataRoute } from 'next';
import { articulosPublicados, configuracion, cursosPublicados, proximosTalleres } from '@/datos/publico';
import { esPendiente } from '@/contenido/textos';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_URL_SITIO ?? 'http://localhost:3000';
  const [cursos, talleres, articulos, config] = await Promise.all([
    cursosPublicados(), proximosTalleres(50), articulosPublicados(), configuracion(),
  ]);
  const fijas = ['/', '/cursos', '/talleres', '/contacto']
    .concat(esPendiente(config.textos.maestraHistoria) ? [] : ['/la-maestra'])
    .concat(articulos.length ? ['/recursos'] : []);
  return [
    ...fijas.map((ruta) => ({ url: `${base}${ruta}` })),
    ...cursos.map((c) => ({ url: `${base}/cursos/${c.slug}` })),
    ...talleres.map((t) => ({ url: `${base}/talleres/${t.slug}` })),
    ...articulos.map((a) => ({ url: `${base}/recursos/${a.slug}`, lastModified: a.publicadoEn })),
  ];
}
