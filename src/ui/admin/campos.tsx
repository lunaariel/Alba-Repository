import { mensajeError, mensajeOk } from '@/dominio/cursos-admin';

/** Campos de formulario del panel, con etiqueta, ayuda y error asociados. */

const base = 'w-full rounded-md border-[1.5px] bg-blanco-calido px-4 text-marron';

type Comun = { nombre: string; etiqueta: string; ayuda?: React.ReactNode; error?: string; className?: string };

function Envoltura({ nombre, etiqueta, ayuda, error, className, children }: Comun & { children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={nombre} className="text-[15px] font-bold">{etiqueta}</label>
      {children}
      {ayuda && <p id={`${nombre}-ayuda`} className="m-0 text-[14px] text-tinta-suave">{ayuda}</p>}
      {error && <p id={`${nombre}-error`} className="m-0 text-[14px] font-bold text-error">{error}</p>}
    </div>
  );
}

const describe = (c: Comun) => [c.ayuda ? `${c.nombre}-ayuda` : null, c.error ? `${c.nombre}-error` : null].filter(Boolean).join(' ') || undefined;

export function Entrada(props: Comun & React.InputHTMLAttributes<HTMLInputElement>) {
  const { nombre, etiqueta, ayuda, error, className, ...resto } = props;
  return (
    <Envoltura {...{ nombre, etiqueta, ayuda, error, className }}>
      <input id={nombre} name={nombre} aria-invalid={error ? true : undefined} aria-describedby={describe(props)}
        className={`${base} min-h-[50px] ${error ? 'border-error' : 'border-borde-control'}`} {...resto} />
    </Envoltura>
  );
}

export function AreaTexto(props: Comun & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { nombre, etiqueta, ayuda, error, className, ...resto } = props;
  return (
    <Envoltura {...{ nombre, etiqueta, ayuda, error, className }}>
      <textarea id={nombre} name={nombre} aria-invalid={error ? true : undefined} aria-describedby={describe(props)}
        className={`${base} min-h-[110px] py-3 leading-relaxed ${error ? 'border-error' : 'border-borde-control'}`} {...resto} />
    </Envoltura>
  );
}

export function Selector(props: Comun & React.SelectHTMLAttributes<HTMLSelectElement> & { opciones: { valor: string; texto: string }[] }) {
  const { nombre, etiqueta, ayuda, error, className, opciones, ...resto } = props;
  return (
    <Envoltura {...{ nombre, etiqueta, ayuda, error, className }}>
      <select id={nombre} name={nombre} aria-describedby={describe(props)} className={`${base} min-h-[50px] ${error ? 'border-error' : 'border-borde-control'}`} {...resto}>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </Envoltura>
  );
}

/** Avisos que llegan por la dirección (?ok=código, ?error=código) después de una acción.
 *  Solo se muestran textos conocidos: nunca se imprime lo que venga en la dirección. */
export function AvisoAccion(props: { ok?: string; error?: string; textos?: { ok: (c?: string) => string | undefined; error: (c: string) => string } }) {
  const ok = (props.textos?.ok ?? mensajeOk)(props.ok);
  const error = props.error ? (props.textos?.error ?? mensajeError)(props.error) : undefined;
  if (!ok && !error) return null;
  return (
    <p role={error ? 'alert' : 'status'} className={`m-0 mb-5 max-w-[860px] rounded-xl border-[1.5px] px-5 py-3.5 font-bold ${error ? 'border-[#D9A592] bg-[#F6E1D9] text-error' : 'border-[#93A68A] bg-salvia-claro text-oliva-profundo'}`}>
      {error ?? ok}
    </p>
  );
}
