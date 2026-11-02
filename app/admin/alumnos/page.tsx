import type { Metadata } from 'next';
import Link from 'next/link';
import { alumnosPanel, type EstadoAcceso, type FiltroAlumnos } from '@/datos/admin-consultas';
import { exigirAdmin } from '@/datos/sesion';
import { CabeceraAdmin, EstadoChip, type Estado } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Alumnos' };

const FILTROS: { valor: FiltroAlumnos; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' }, { valor: 'vigentes', texto: 'Con acceso vigente' }, { valor: 'vencen_pronto', texto: 'Vencen en 30 días' },
  { valor: 'vencidos', texto: 'Con acceso vencido' }, { valor: 'programados', texto: 'Con acceso programado' },
];
const ESTADO: Record<EstadoAcceso, { chip: Estado; texto: string }> = {
  vigente: { chip: 'publicado', texto: 'Vigente' }, sin_vencimiento: { chip: 'publicado', texto: 'Sin vencimiento' },
  vence_pronto: { chip: 'pendiente', texto: 'Vence pronto' }, programado: { chip: 'borrador', texto: 'Programado' },
  vencido: { chip: 'archivado', texto: 'Vencido' },
};
const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(d);

type Props = { searchParams: Promise<{ q?: string; filtro?: string }> };

// Solo lectura. Becas, validaciones y revocaciones se hacen desde la pestaña Alumnos de cada curso.
export default async function Alumnos({ searchParams }: Props) {
  await exigirAdmin();
  const { q = '', filtro: f = 'todos' } = await searchParams;
  const filtro = (FILTROS.some((x) => x.valor === f) ? f : 'todos') as FiltroAlumnos;
  const busqueda = q.slice(0, 80);
  const alumnos = await alumnosPanel(busqueda, filtro);
  const enlace = (v: FiltroAlumnos) => `/admin/alumnos?${new URLSearchParams({ ...(busqueda ? { q: busqueda } : {}), filtro: v })}`;
  return (
    <>
      <CabeceraAdmin titulo="Alumnos" bajada="Quiénes están inscriptos y en qué estado está cada acceso. Para otorgar becas o validar actividades, entre al curso desde la pestaña Alumnos." />
      <form method="get" action="/admin/alumnos" className="flex max-w-[720px] flex-wrap items-end gap-3" role="search">
        <input type="hidden" name="filtro" value={filtro} />
        <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5 text-[15px] font-bold">Buscar por nombre o correo
          <input name="q" defaultValue={busqueda} maxLength={80} className="min-h-[48px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 font-normal text-marron" />
        </label>
        <button type="submit" className="min-h-[48px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">Buscar</button>
      </form>
      <nav aria-label="Filtrar por estado del acceso" className="mt-4 flex flex-wrap gap-2">
        {FILTROS.map((x) => (
          <Link key={x.valor} href={enlace(x.valor)} aria-current={x.valor === filtro ? 'page' : undefined}
            className={`inline-flex min-h-[40px] items-center rounded-full border-[1.5px] px-4 text-[14px] font-bold no-underline ${x.valor === filtro ? 'border-oliva-profundo bg-oliva-profundo text-marfil' : 'border-borde-bandeja bg-blanco-calido text-marron hover:bg-arena'}`}>
            {x.texto}
          </Link>
        ))}
      </nav>
      <p className="m-0 mt-4 text-[15px] text-tinta-suave" aria-live="polite">{alumnos.length === 1 ? '1 persona' : `${alumnos.length} personas`}{alumnos.length === 500 ? ' (se muestran las primeras 500: afine la búsqueda)' : ''}</p>
      {alumnos.length === 0 ? (
        <div className="mt-3 max-w-[720px] rounded-2xl bg-arena p-6">
          <p className="m-0">{busqueda || filtro !== 'todos' ? 'No hay personas con esa búsqueda o ese estado.' : 'Todavía no hay alumnos registrados.'}</p>
        </div>
      ) : (
        <ul className="m-0 mt-3 flex max-w-[1000px] list-none flex-col gap-3 p-0">
          {alumnos.map((a) => (
            <li key={a.id} className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4">
              <p className="m-0 font-bold">{a.nombre}</p>
              <p className="m-0 break-all text-[14px] text-tinta-suave">{a.correo} · registrada el {fecha(a.creadoEn)}</p>
              {a.cursos.length === 0 ? (
                <p className="m-0 mt-2 text-[15px] text-tinta-suave">Sin cursos.</p>
              ) : (
                <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                  {a.cursos.map((c) => (
                    <li key={c.cursoId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                      <EstadoChip estado={ESTADO[c.estado].chip} texto={ESTADO[c.estado].texto} />
                      <Link href={`/admin/cursos/${c.cursoId}/alumnos`} className="font-bold text-oliva-profundo">{c.curso}</Link>
                      <span className="text-tinta-suave">
                        {c.estado === 'programado' && c.proximoInicio ? `se reanuda el ${fecha(c.proximoInicio)}`
                          : c.fin && c.estado !== 'sin_vencimiento' ? `${c.estado === 'vencido' ? 'venció' : 'hasta'} el ${fecha(c.fin)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
