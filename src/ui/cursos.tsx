import Link from 'next/link';
import { EnlaceBoton } from './acciones';
import { MarcoFoto } from './estructura';
import { FILTROS, metadatosCurso, type CursoResumen, type IdFiltro } from '@/dominio/catalogo';
import { formatearUSD } from '@/dominio/dinero';

/**
 * Chips de filtro. Son enlaces (no botones) para que funcionen sin JavaScript y se puedan
 * compartir; el elegido lleva aria-current. Ajuste respecto del prototipo B, que filtraba en memoria.
 */
export function ChipsFiltro({ actual, ruta, ancla = '' }: { actual: IdFiltro; ruta: string; ancla?: string }) {
  return (
    <nav aria-label="Filtrar cursos" className="flex flex-wrap gap-2">
      {FILTROS.map((f) => {
        const activo = f.id === actual;
        const href = `${ruta}${f.id === 'todos' ? '' : `?para=${f.id}`}${ancla}`;
        return (
          <Link
            key={f.id}
            href={href}
            scroll={false}
            aria-current={activo ? 'true' : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-full border-2 px-4 text-base no-underline ${
              activo ? 'border-oliva-profundo bg-oliva-profundo font-bold text-marfil' : 'border-borde-bandeja bg-marfil text-marron'
            }`}
          >
            {f.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

const TINTES = ['#C2CDB9', '#D9CBAE', '#B7C4AE'];

export function BandejaCurso({ curso, indice }: { curso: CursoResumen; indice: number }) {
  return (
    <li className="flex flex-col rounded-2xl border-[1.5px] border-borde-bandeja bg-marfil p-3.5">
      {curso.portadaRuta ? (
        // Las portadas viven en almacenamiento público; el alt describe la escena, no repite el título.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={curso.portadaRuta} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
      ) : (
        <MarcoFoto
          className="aspect-[4/3] rounded-lg"
          tinte={TINTES[indice % TINTES.length]}
          alt="Espacio para la fotografía del curso"
          descripcion="Fotografía del curso pendiente."
        />
      )}
      <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-5">
        <p className="m-0 text-[15px] text-tinta-suave">{metadatosCurso(curso)}</p>
        <h3 className="m-0 mt-2 text-2xl leading-tight">{curso.titulo}</h3>
        {curso.resumen && <p className="m-0 mt-2.5 text-base">{curso.resumen}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
          <p className="m-0 text-[15px] font-bold text-oliva-profundo">{formatearUSD(curso.precioCentavos)}</p>
          <EnlaceBoton href={`/cursos/${curso.slug}`} tamano="compacto">Ver el curso</EnlaceBoton>
        </div>
      </div>
    </li>
  );
}

/** Grilla de bandejas. Con 0 resultados por filtro muestra el estado vacío del sistema de diseño. */
export function GrillaCursos({ cursos, filtro, ruta }: { cursos: CursoResumen[]; filtro: IdFiltro; ruta: string }) {
  if (cursos.length === 0) {
    return (
      <div className="rounded-2xl bg-marfil px-6 py-12 text-center">
        <p className="m-0 text-[19px]">Todavía no hay cursos para esta elección.</p>
        {filtro !== 'todos' && (
          <div className="mt-4">
            <EnlaceBoton href={ruta} variante="secundario" tamano="compacto">Ver todos los cursos</EnlaceBoton>
          </div>
        )}
      </div>
    );
  }
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-7 p-0 lg:px-6">
      {cursos.map((c, i) => <BandejaCurso key={c.slug} curso={c} indice={i} />)}
    </ul>
  );
}
