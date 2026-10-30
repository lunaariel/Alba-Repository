import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { configuracion } from '@/datos/publico';
import { esPendiente } from '@/contenido/textos';
import { Parrafos } from '@/ui/contenido';

const PAGINAS = {
  terminos: { titulo: 'Términos y condiciones', clave: 'terminos' },
  privacidad: { titulo: 'Política de privacidad', clave: 'privacidad' },
  reembolsos: { titulo: 'Política de reembolsos', clave: 'reembolsos' },
} as const;

type Slug = keyof typeof PAGINAS;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pagina = PAGINAS[(await params).slug as Slug];
  if (!pagina) return { title: 'Página no encontrada' };
  const { textos } = await configuracion();
  return {
    title: pagina.titulo,
    alternates: { canonical: `/legales/${(await params).slug}` },
    robots: esPendiente(textos[pagina.clave]) ? { index: false } : undefined,
  };
}

export default async function Legal({ params }: Props) {
  const pagina = PAGINAS[(await params).slug as Slug];
  if (!pagina) notFound();
  const { textos } = await configuracion();
  const texto = textos[pagina.clave];
  return (
    <article className="mx-auto max-w-[860px] px-[clamp(20px,4vw,56px)] py-[clamp(56px,7vw,96px)]">
      <h1 className="m-0 text-[clamp(32px,3.6vw,48px)]">{pagina.titulo}</h1>
      <div className="mt-8 flex max-w-[34em] flex-col gap-4 text-lg">
        {esPendiente(texto) ? (
          <p className="m-0">Este texto está en redacción y revisión legal. Si tiene una consulta, escríbanos desde la página de contacto.</p>
        ) : (
          <Parrafos texto={texto!} />
        )}
      </div>
    </article>
  );
}
