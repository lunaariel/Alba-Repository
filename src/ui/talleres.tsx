import Link from 'next/link';
import type { TallerPublico } from '@/datos/publico';
import { textoCupo } from '@/dominio/talleres';

const fecha = (d: Date, zona: string) =>
  new Intl.DateTimeFormat('es-GT', { timeZone: zona, day: 'numeric', month: 'short' }).format(d);
const hora = (d: Date, zona: string) =>
  new Intl.DateTimeFormat('es-GT', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

export function FilaTaller({ taller }: { taller: TallerPublico }) {
  return (
    <li className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-xl bg-marfil px-6 py-5">
      <p className="m-0 min-w-24 font-display text-xl font-semibold">{fecha(taller.iniciaEn, taller.zonaHoraria)}</p>
      <div className="min-w-0 flex-[1_1_240px]">
        <h3 className="m-0 font-texto text-[19px] font-bold">{taller.titulo}</h3>
        <p className="m-0 mt-0.5 text-[15px] text-tinta-suave">
          {hora(taller.iniciaEn, taller.zonaHoraria)} (hora de Guatemala) · {textoCupo(taller.cupo, taller.ocupados, taller.estado)}
        </p>
      </div>
      <Link href={`/talleres/${taller.slug}`} className="py-2.5 font-bold text-oliva-profundo underline underline-offset-4">
        Ver detalles
      </Link>
    </li>
  );
}

export function ListaTalleres({ talleres }: { talleres: TallerPublico[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
      {talleres.map((t) => <FilaTaller key={t.id} taller={t} />)}
    </ul>
  );
}
