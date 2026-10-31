import type { Metadata } from 'next';
import Link from 'next/link';
import { listaCursos } from '@/datos/admin-cursos';
import { formatearUSD } from '@/dominio/dinero';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';
import { AvisoAccion } from '@/ui/admin/campos';
import { NuevoCurso } from './NuevoCurso';

export const metadata: Metadata = { title: 'Cursos' };

export default async function Cursos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [cursos, aviso] = await Promise.all([listaCursos(), searchParams]);
  return (
    <>
      <CabeceraAdmin titulo="Cursos" bajada="Cree, edite y publique los cursos. Un curso con alumnos se archiva en lugar de eliminarse." />
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <section aria-labelledby="lista">
          <h2 id="lista" className="sr-only">Lista de cursos</h2>
          {cursos.length === 0 ? (
            <div className="rounded-2xl bg-arena p-7">
              <p className="m-0 font-display text-[22px]">Todavía no hay cursos.</p>
              <p className="m-0 mt-2">Cree el primero con el formulario.</p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {cursos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4">
                  <div className="min-w-0 flex-[1_1_320px]">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <EstadoChip estado={c.estado} />
                      <h3 className="m-0 font-texto text-[18px] font-bold">
                        <Link href={`/admin/cursos/${c.id}`} className="text-marron no-underline hover:underline">{c.titulo}</Link>
                      </h3>
                    </div>
                    <p className="m-0 mt-1 text-[14px] text-tinta-suave">
                      {c.precioCentavos > 0 ? formatearUSD(c.precioCentavos) : 'Sin precio'} · {c.lecciones === 1 ? '1 lección' : `${c.lecciones} lecciones`} ·{' '}
                      {c.alumnos === 1 ? '1 alumno' : `${c.alumnos} alumnos`} · {c.certificados === 1 ? '1 certificado' : `${c.certificados} certificados`}
                    </p>
                  </div>
                  <Link href={`/admin/cursos/${c.id}`} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo underline underline-offset-4">Editar</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <NuevoCurso />
      </div>
    </>
  );
}
