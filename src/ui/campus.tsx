import Link from 'next/link';
import type { CursoCampus, LeccionCampus } from '@/datos/campus';
import { textoAvance } from '@/dominio/aprendizaje';
import { EnlaceBoton } from './acciones';

/** Barra de avance accesible: el porcentaje también se lee en texto. */
export function BarraAvance({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      className="h-2.5 w-full overflow-hidden rounded-full bg-arena"
    >
      <div className="h-full rounded-full bg-oliva-profundo" style={{ width: `${valor}%` }} />
    </div>
  );
}

export function Marca({ hecha }: { hecha: boolean }) {
  return hecha ? (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <circle cx="11" cy="11" r="10" fill="#4E6049" />
      <path d="M6.5 11.5l3 3 6-6.5" fill="none" stroke="#F8F5EE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <circle cx="11" cy="11" r="9.25" fill="none" stroke="#8C7F66" strokeWidth="1.5" />
    </svg>
  );
}

export function TarjetaCursoCampus({ curso }: { curso: CursoCampus }) {
  const hechas = curso.lecciones.filter((l) => l.completada).length;
  const base = `/campus/cursos/${curso.slug}`;
  const accion = curso.certificado
    ? { href: base, texto: 'Ver curso y certificado' }
    : curso.continuar
      ? { href: `${base}/lecciones/${curso.continuar.id}`, texto: hechas === 0 ? 'Empezar el curso' : 'Continuar donde lo dejó' }
      : { href: base, texto: 'Ir a la evaluación final' };
  return (
    <li className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6 sm:p-7">
      <div>
        <h2 className="m-0 text-[clamp(22px,2.4vw,28px)] leading-tight">
          <Link href={base} className="text-marron no-underline hover:underline">{curso.titulo}</Link>
        </h2>
        {curso.resumen && <p className="m-0 mt-2 text-tinta-suave">{curso.resumen}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <BarraAvance valor={curso.avance} etiqueta={`Avance en ${curso.titulo}`} />
        <p className="m-0 text-[15px] text-tinta-suave">
          {textoAvance(hechas, curso.lecciones.length)} · {curso.avance} %
        </p>
      </div>
      {curso.continuar && hechas > 0 && (
        <p className="m-0 text-[15px]">
          <span className="text-tinta-suave">Sigue con: </span>
          <span className="font-bold">{curso.continuar.titulo}</span>
        </p>
      )}
      <div><EnlaceBoton href={accion.href} tamano="compacto">{accion.texto}</EnlaceBoton></div>
    </li>
  );
}

/** Temario con el estado de cada lección, agrupado por módulo. */
export function TemarioCampus({ slug, lecciones, actual }: { slug: string; lecciones: LeccionCampus[]; actual?: string }) {
  const modulos: { titulo: string; orden: number; lecciones: LeccionCampus[] }[] = [];
  for (const l of lecciones) {
    let m = modulos.find((x) => x.orden === l.moduloOrden);
    if (!m) modulos.push((m = { titulo: l.moduloTitulo, orden: l.moduloOrden, lecciones: [] }));
    m.lecciones.push(l);
  }
  return (
    <div className="flex flex-col gap-5">
      {modulos.map((m, i) => (
        <section key={m.orden} aria-labelledby={`modulo-${i}`}>
          <h3 id={`modulo-${i}`} className="m-0 mb-2 font-texto text-[15px] font-bold uppercase tracking-[0.06em] text-tinta-suave">
            Módulo {i + 1} · {m.titulo}
          </h3>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {m.lecciones.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/campus/cursos/${slug}/lecciones/${l.id}`}
                  aria-current={l.id === actual ? 'page' : undefined}
                  className="flex min-h-[48px] items-center gap-3 rounded-md px-3 py-2 text-marron no-underline hover:bg-arena aria-[current=page]:bg-arena aria-[current=page]:font-bold"
                >
                  <Marca hecha={l.completada} />
                  <span className="min-w-0 flex-1">{l.titulo}</span>
                  <span className="sr-only">{l.completada ? '(completada)' : '(pendiente)'}</span>
                  {l.duracionMinutos && <span className="shrink-0 text-[14px] text-tinta-suave">{l.duracionMinutos} min</span>}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function EncabezadoCampus({ titulo, bajada, volver }: { titulo: string; bajada?: React.ReactNode; volver?: { href: string; texto: string } }) {
  return (
    <div className="bg-marfil">
      <div className="mx-auto max-w-[1240px] px-[clamp(20px,4vw,56px)] pb-8 pt-[clamp(32px,5vw,56px)]">
        {volver && (
          <Link href={volver.href} className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-bold text-oliva-profundo no-underline hover:underline">
            <span aria-hidden="true">←</span> {volver.texto}
          </Link>
        )}
        <h1 className="m-0 text-[clamp(32px,4vw,50px)] leading-[1.1]">{titulo}</h1>
        {bajada && <div className="m-0 mt-3 max-w-[40em] text-lg text-tinta-suave">{bajada}</div>}
      </div>
    </div>
  );
}
