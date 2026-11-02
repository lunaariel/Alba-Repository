import type { Metadata } from 'next';
import { certificadosPanel } from '@/datos/admin-consultas';
import { exigirAdmin } from '@/datos/sesion';
import { CabeceraAdmin } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Certificados' };

const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(d);
type Props = { searchParams: Promise<{ q?: string }> };

// Solo consulta y descarga. La revocación de certificados todavía no está definida (decisión pendiente).
export default async function Certificados({ searchParams }: Props) {
  await exigirAdmin();
  const { q = '' } = await searchParams;
  const busqueda = q.slice(0, 80);
  const certificados = await certificadosPanel(busqueda);
  return (
    <>
      <CabeceraAdmin titulo="Certificados" bajada="Certificados emitidos, con su código de verificación. Cada certificado conserva los datos con que se emitió." />
      <form method="get" action="/admin/certificados" className="flex max-w-[720px] flex-wrap items-end gap-3" role="search">
        <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5 text-[15px] font-bold">Buscar por código, nombre o curso
          <input name="q" defaultValue={busqueda} maxLength={80} className="min-h-[48px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 font-normal text-marron" />
        </label>
        <button type="submit" className="min-h-[48px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">Buscar</button>
      </form>
      <p className="m-0 mt-4 text-[15px] text-tinta-suave" aria-live="polite">{certificados.length === 1 ? '1 certificado' : `${certificados.length} certificados`}</p>
      {certificados.length === 0 ? (
        <div className="mt-3 max-w-[720px] rounded-2xl bg-arena p-6"><p className="m-0">{busqueda ? 'Ningún certificado coincide con la búsqueda.' : 'Todavía no se emitió ningún certificado.'}</p></div>
      ) : (
        <ul className="m-0 mt-3 flex max-w-[1000px] list-none flex-col gap-3 p-0">
          {certificados.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido px-5 py-4">
              <div className="min-w-0 flex-[1_1_320px]">
                <p className="m-0 font-bold">{c.nombre}</p>
                <p className="m-0 mt-1 text-[14px] text-tinta-suave">
                  {c.curso}{c.version ? ` · versión ${c.version}` : ''}{c.modalidad ? ` · ${c.modalidad === 'formativa' ? 'evaluación formativa' : 'evaluación con puntaje'}` : ''} · emitido el {fecha(c.emitidoEn)}
                </p>
                <p className="m-0 mt-1 font-mono text-[14px]">Código {c.codigo}</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <a href={`/admin/certificados/${c.id}/pdf`} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo underline underline-offset-4">Descargar PDF</a>
                <a href={`/verificar/${c.codigo}`} className="inline-flex min-h-[44px] items-center font-bold text-oliva-profundo underline underline-offset-4">Verificación pública</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
