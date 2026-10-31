import type { Metadata } from 'next';
import Link from 'next/link';
import { registroActividad } from '@/datos/admin';
import { describirActividad, grupoDesdeUrl, GRUPOS_ACTIVIDAD } from '@/dominio/auditoria';
import { CabeceraAdmin } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Registro de actividad' };

type Props = { searchParams: Promise<{ grupo?: string; pagina?: string }> };

const cuando = (d: Date) =>
  new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

export default async function Actividad({ searchParams }: Props) {
  const p = await searchParams;
  const grupo = grupoDesdeUrl(p.grupo);
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(p.pagina ?? '1', 10) || 1));
  const { registros, total, paginas } = await registroActividad({ pagina, grupo });
  const enlace = (n: number) => `/admin/configuracion/actividad?${new URLSearchParams({ ...(grupo ? { grupo } : {}), pagina: String(n) })}`;

  return (
    <>
      <CabeceraAdmin
        titulo="Registro de actividad"
        migas={[{ href: '/admin/configuracion', texto: 'Configuración' }]}
        bajada="Cada cambio importante queda anotado con su autora, la fecha (hora de Guatemala) y el antes y el después. Nadie puede editar ni borrar este registro."
      />

      <nav aria-label="Filtrar por tema" className="mb-5 flex flex-wrap gap-2">
        {[{ id: null, texto: 'Todo' }, ...Object.entries(GRUPOS_ACTIVIDAD).map(([id, g]) => ({ id, texto: g.texto }))].map((f) => (
          <Link
            key={f.id ?? 'todo'}
            href={f.id ? `/admin/configuracion/actividad?grupo=${f.id}` : '/admin/configuracion/actividad'}
            aria-current={grupo === f.id ? 'page' : undefined}
            className="inline-flex min-h-[40px] items-center rounded-full border-[1.5px] border-borde-control bg-blanco-calido px-4 text-[15px] text-marron no-underline hover:bg-arena aria-[current=page]:border-oliva-profundo aria-[current=page]:bg-oliva-profundo aria-[current=page]:font-bold aria-[current=page]:text-marfil"
          >
            {f.texto}
          </Link>
        ))}
      </nav>

      {registros.length === 0 ? (
        <div className="max-w-[640px] rounded-2xl bg-arena p-7">
          <p className="m-0 font-display text-[22px]">Todavía no hay actividad {grupo ? 'en este tema' : 'registrada'}.</p>
          <p className="m-0 mt-2">Aparecerá aquí en cuanto se cree, publique o modifique algo desde el panel.</p>
        </div>
      ) : (
        <>
          <p className="m-0 mb-3 text-[15px] text-tinta-suave">{total === 1 ? '1 registro' : `${total} registros`}{paginas > 1 ? ` · página ${pagina} de ${paginas}` : ''}</p>
          <ol className="m-0 flex max-w-[1000px] list-none flex-col gap-2.5 p-0">
            {registros.map((r) => {
              const d = describirActividad(r);
              return (
                <li key={r.id} className="rounded-xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <p className="m-0 font-bold">
                      {d.titulo}{d.nombre ? <span className="font-normal">: {d.nombre}</span> : null}
                    </p>
                    <p className="m-0 text-[14px] text-tinta-suave"><time dateTime={r.fecha.toISOString()}>{cuando(r.fecha)}</time> · {r.autor}</p>
                  </div>
                  {d.cambios.length > 0 && (
                    <dl className="m-0 mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[15px]">
                      {d.cambios.map((c) => (
                        <div key={c.campo} className="contents">
                          <dt className="text-tinta-suave">{c.campo}</dt>
                          <dd className="m-0 min-w-0 break-words">
                            {c.antes !== null && c.despues !== null ? (
                              <><span className="text-tinta-suave line-through decoration-1">{c.antes}</span> <span aria-hidden="true">→</span><span className="sr-only">cambió a</span> {c.despues}</>
                            ) : (c.despues ?? <span className="text-tinta-suave">{c.antes} (quitado)</span>)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
          {paginas > 1 && (
            <nav aria-label="Páginas" className="mt-6 flex items-center gap-4">
              {pagina > 1 && <Link href={enlace(pagina - 1)} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo">← Más recientes</Link>}
              {pagina < paginas && <Link href={enlace(pagina + 1)} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo">Anteriores →</Link>}
            </nav>
          )}
        </>
      )}
    </>
  );
}
