import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { configuracion, proximosTalleres } from '@/datos/publico';
import { Contenedor } from '@/ui/estructura';
import { ListaTalleres } from '@/ui/talleres';
import { EnlaceBoton } from '@/ui/acciones';

export const metadata: Metadata = {
  title: 'Talleres en vivo',
  description: 'Encuentros por videollamada con la maestra, con cupos limitados, para practicar y preguntar en grupo.',
  alternates: { canonical: '/talleres' },
};


export default async function Talleres() {
  // Talleres no habilitados para el público: la página no existe (sin borrar nada).
  if (!(await configuracion()).talleresPublicos) notFound();
  const talleres = await proximosTalleres(24);
  return (
    <section aria-labelledby="titulo" className="bg-arena">
      <Contenedor className="flex flex-wrap gap-x-[72px] gap-y-8 py-[clamp(56px,7vw,96px)]">
        <div className="max-w-[420px] flex-[1_1_300px]">
          <h1 id="titulo" className="m-0 text-[clamp(36px,4vw,56px)] leading-[1.1]">Talleres en vivo</h1>
          <p className="m-0 mt-3.5">Encuentros por videollamada, con cupos limitados. Los horarios se muestran en hora de Guatemala y, en cada taller, también en la suya.</p>
        </div>
        <div className="min-w-0 flex-[2_1_480px]">
          {talleres.length > 0 ? (
            <ListaTalleres talleres={talleres} />
          ) : (
            <div className="rounded-xl bg-marfil px-6 py-10">
              <p className="m-0 text-[19px]">No hay talleres programados por ahora.</p>
              <div className="mt-4"><EnlaceBoton href="/contacto" variante="secundario" tamano="compacto">Quiero recibir el aviso</EnlaceBoton></div>
            </div>
          )}
        </div>
      </Contenedor>
    </section>
  );
}
