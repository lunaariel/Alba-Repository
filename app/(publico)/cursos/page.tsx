import type { Metadata } from 'next';
import { cursosPublicados } from '@/datos/publico';
import { filtrarCursos, filtroDesdeUrl } from '@/dominio/catalogo';
import { Contenedor } from '@/ui/estructura';
import { ChipsFiltro, GrillaCursos } from '@/ui/cursos';
import { EnlaceBoton } from '@/ui/acciones';

export const metadata: Metadata = {
  title: 'Cursos',
  description: 'Cursos grabados sobre Montessori, crianza y primera infancia, para familias, docentes y cuidadores.',
  alternates: { canonical: '/cursos' },
};

export default async function Cursos({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  const [{ para }, cursos] = await Promise.all([searchParams, cursosPublicados()]);
  const filtro = filtroDesdeUrl(para);

  return (
    <section aria-labelledby="titulo" className="bg-arena">
      <Contenedor className="py-[clamp(56px,7vw,96px)]">
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <div className="max-w-[560px]">
            <h1 id="titulo" className="m-0 text-[clamp(36px,4vw,56px)] leading-[1.1]">Cursos</h1>
            <p className="m-0 mt-3.5">Grabados, para ver a su ritmo, con materiales descargables y un período de acceso que se informa en cada curso.</p>
          </div>
          {cursos.length > 0 && <ChipsFiltro actual={filtro} ruta="/cursos" />}
        </div>
        <div className="mt-12">
          {cursos.length > 0 ? (
            <GrillaCursos cursos={filtrarCursos(cursos, filtro)} filtro={filtro} ruta="/cursos" />
          ) : (
            <div className="rounded-2xl bg-marfil px-6 py-12 text-center">
              <p className="m-0 text-[19px]">Todavía no hay cursos publicados.</p>
              <div className="mt-4"><EnlaceBoton href="/contacto" variante="secundario" tamano="compacto">Quiero recibir el aviso</EnlaceBoton></div>
            </div>
          )}
        </div>
      </Contenedor>
    </section>
  );
}
