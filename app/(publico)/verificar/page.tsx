import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Contenedor } from '@/ui/estructura';

export const metadata: Metadata = {
  title: 'Verificar un certificado',
  description: 'Compruebe que un certificado de finalización fue emitido por Albor.',
  alternates: { canonical: '/verificar' },
};

export default async function Verificar({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams;
  const limpio = (codigo ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase();
  if (limpio) redirect(`/verificar/${limpio}`);
  return (
    <section aria-labelledby="titulo" className="bg-marfil">
      <Contenedor className="py-[clamp(48px,7vw,96px)]">
        <h1 id="titulo" className="m-0 text-[clamp(34px,4vw,52px)] leading-[1.1]">Verificar un certificado</h1>
        <p className="m-0 mt-3 max-w-[36em] text-lg">Escriba el código de 12 caracteres que figura al pie del certificado.</p>
        <form method="get" className="mt-8 flex max-w-[560px] flex-wrap items-end gap-4">
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
            <label htmlFor="codigo" className="text-[15px] font-bold">Código de verificación</label>
            <input
              id="codigo" name="codigo" required maxLength={20} autoComplete="off" spellCheck={false}
              className="min-h-[52px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 uppercase tracking-[0.08em] text-marron"
            />
          </div>
          <button type="submit" className="min-h-[52px] rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil hover:bg-marron">Verificar</button>
        </form>
      </Contenedor>
    </section>
  );
}
