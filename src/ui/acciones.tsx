import Link from 'next/link';

/** Botones y enlaces de acción del sistema de diseño. Un solo primario por sección. */

const base = 'inline-flex items-center font-bold no-underline transition-colors';
const variantes = {
  primario: 'bg-oliva-profundo text-marfil hover:bg-marron',
  secundario: 'border-2 border-oliva-profundo bg-marfil text-oliva-profundo hover:bg-arena',
  claro: 'bg-marfil text-[#3F4F3B] hover:bg-arena',
};
const tamanos = {
  normal: 'min-h-[54px] rounded-md px-7 text-[17px]',
  compacto: 'min-h-[44px] rounded-sm px-[18px] text-base',
};

export function EnlaceBoton(props: {
  href: string;
  children: React.ReactNode;
  variante?: keyof typeof variantes;
  tamano?: keyof typeof tamanos;
}) {
  return (
    <Link href={props.href} className={`${base} ${variantes[props.variante ?? 'primario']} ${tamanos[props.tamano ?? 'normal']}`}>
      {props.children}
    </Link>
  );
}

export function EnlaceAccion({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo underline underline-offset-[5px] hover:decoration-2">
      {children}
    </Link>
  );
}
