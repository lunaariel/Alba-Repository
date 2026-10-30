import type { PreguntaFrecuente } from '@/contenido/textos';
import type { Bloque, Linea } from '@/dominio/articulo';

export function PreguntasFrecuentes({ preguntas }: { preguntas: PreguntaFrecuente[] }) {
  return (
    <div className="flex flex-col gap-3">
      {preguntas.map((p) => (
        <details key={p.pregunta} className="rounded-lg bg-arena px-[22px] py-[18px]">
          <summary className="cursor-pointer text-lg font-bold">{p.pregunta}</summary>
          <p className="m-0 mt-3">{p.respuesta}</p>
        </details>
      ))}
    </div>
  );
}

/** Dibuja un artículo leído por leerArticulo. Nunca usa HTML crudo. */
function Lineas({ partes }: { partes: Linea[] }) {
  return (
    <>
      {partes.map((p, i) =>
        p.tipo === 'negrita' ? <strong key={i}>{p.valor}</strong>
        : p.tipo === 'enlace' ? <a key={i} href={p.href} className="text-oliva-profundo underline underline-offset-4">{p.valor}</a>
        : <span key={i}>{p.valor}</span>,
      )}
    </>
  );
}

export function CuerpoArticulo({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="flex max-w-[34em] flex-col gap-5 text-lg">
      {bloques.map((b, i) => {
        if (b.tipo === 'h2') return <h2 key={i} className="m-0 mt-4 text-3xl"><Lineas partes={b.contenido} /></h2>;
        if (b.tipo === 'h3') return <h3 key={i} className="m-0 mt-2 text-2xl"><Lineas partes={b.contenido} /></h3>;
        if (b.tipo === 'lista') {
          return (
            <ul key={i} className="m-0 flex list-disc flex-col gap-2 pl-6">
              {b.items.map((it, j) => <li key={j}><Lineas partes={it} /></li>)}
            </ul>
          );
        }
        return <p key={i} className="m-0"><Lineas partes={b.contenido} /></p>;
      })}
    </div>
  );
}

/** Texto con párrafos separados por línea en blanco (biografías, legales). */
export function Parrafos({ texto, className = '' }: { texto: string; className?: string }) {
  return (
    <>
      {texto.split(/\n\s*\n/).map((p, i) => <p key={i} className={`m-0 ${className}`}>{p.trim()}</p>)}
    </>
  );
}
