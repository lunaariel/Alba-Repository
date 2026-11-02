import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { CONFIG_PREDETERMINADA, requisitosParaAlumno, usaPreguntas } from '@/dominio/evaluacion';
import { textoAcceso } from '@/dominio/catalogo';
import { proveedorVideo } from '@/servicios/video';

export const metadata: Metadata = { title: 'Vista previa del borrador' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ leccion?: string }> };
const tarjeta = 'rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6';

/**
 * El borrador como lo vería un alumno: temario vigente (sin lo retirado ni lo bloqueado), lección elegida,
 * materiales, requisitos de finalización y preguntas sin respuestas. Solo lectura: no crea inscripciones,
 * avances, intentos, resultados ni certificados.
 */
export default async function VistaPrevia({ params, searchParams }: Props) {
  const [{ id }, { leccion }] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  if (!c) notFound();
  const modulos = c.modulos.filter((m) => !m.retirado)
    .map((m) => ({ ...m, lecciones: m.lecciones.filter((l) => !l.retirada && !l.marca.bloqueada) }))
    .filter((m) => m.lecciones.length > 0);
  const lecciones = modulos.flatMap((m) => m.lecciones);
  const actual = lecciones.find((l) => l.id === leccion) ?? lecciones[0];
  const config = c.evaluacion?.config ?? CONFIG_PREDETERMINADA;
  const preguntas = usaPreguntas(config) ? (c.evaluacion?.preguntas ?? []).filter((p) => !p.retirada && !p.marca.bloqueada) : [];
  const proveedor = proveedorVideo();
  // El id privado ya lo leyó el servidor (cursoAdmin, después de exigirAdmin). La URL firmada vence en 30 minutos.
  const urlVideo = actual?.videoId && proveedor ? await proveedor.urlReproduccion(actual.videoId, { segundosValidez: 30 * 60 }).catch(() => null) : null;
  const base = `/admin/cursos/${c.id}/vista-previa`;

  return (
    <>
      <p role="note" className="m-0 mb-5 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
        <b>Vista previa del borrador.</b> Así vería el curso un alumno si publicara ahora. Es solo lectura: no crea inscripciones, avances,
        intentos, resultados ni certificados. {c.versiones.length > 0 && 'Los alumnos actuales siguen viendo su versión publicada.'}
      </p>
      {lecciones.length === 0 ? (
        <div className="max-w-[760px] rounded-2xl bg-arena p-6">
          <p className="m-0">El borrador todavía no tiene lecciones vigentes. Agréguelas en <Link href={`/admin/cursos/${c.id}/temario`} className="font-bold text-oliva-profundo">Temario</Link>.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          <div className="min-w-0 flex-[1_1_520px]">
            {actual && (
              <section aria-labelledby="leccion-previa" className={tarjeta}>
                <p className="m-0 text-[14px] font-bold text-tinta-suave">Lección</p>
                <h2 id="leccion-previa" className="m-0 mt-1 text-[26px]">{actual.titulo}</h2>
                <div className="mt-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[#E4DED2] text-center text-[15px] text-tinta-suave">
                  {urlVideo
                    ? <iframe src={urlVideo} title={`Video: ${actual.titulo}`} className="h-full w-full border-0" allow="encrypted-media; picture-in-picture" allowFullScreen />
                    : <span className="px-6">{actual.videoId ? 'Video cargado (se reproduce cuando el proveedor de video esté conectado).' : 'Esta lección todavía no tiene video.'}</span>}
                </div>
                {actual.descripcion
                  ? <p className="m-0 mt-4 whitespace-pre-line">{actual.descripcion}</p>
                  : <p className="m-0 mt-4 text-tinta-suave">Sin descripción.</p>}
                {actual.materiales.filter((m) => !m.retirado && !m.bloqueado).length > 0 && (
                  <div className="mt-5">
                    <h3 className="m-0 text-[18px]">Materiales</h3>
                    <ul className="m-0 mt-2 list-disc pl-5">
                      {actual.materiales.filter((m) => !m.retirado && !m.bloqueado).map((m) => (
                        <li key={m.id}>{m.titulo}{m.complementario ? ' · complementario, opcional' : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {preguntas.length > 0 && (
              <section aria-labelledby="preguntas-previa" className={`${tarjeta} mt-6`}>
                <h2 id="preguntas-previa" className="m-0 text-[22px]">{config.modalidad === 'formativa' ? 'Actividades formativas' : 'Evaluación final'}</h2>
                <p className="m-0 mt-1 text-[15px] text-tinta-suave">
                  {config.modalidad === 'formativa' ? 'Sin nota. ' : `Necesita ${config.puntajeMinimo} puntos para aprobar. `}Las respuestas correctas nunca se muestran al alumno.
                </p>
                <ol className="m-0 mt-4 flex list-decimal flex-col gap-4 pl-5">
                  {preguntas.map((p) => (
                    <li key={p.id}>
                      <p className="m-0 font-bold">{p.enunciado}</p>
                      <ul className="m-0 mt-1 list-[circle] pl-5 text-[15px]">{p.opciones.map((o) => <li key={o.id}>{o.texto}</li>)}</ul>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <aside aria-label="Temario y requisitos" className="flex min-w-0 flex-[0_1_380px] flex-col gap-5">
            <section aria-labelledby="temario-previa" className={tarjeta}>
              <h2 id="temario-previa" className="m-0 text-[22px]">Temario</h2>
              {modulos.map((m) => (
                <div key={m.id} className="mt-3">
                  <p className="m-0 text-[14px] font-bold uppercase tracking-wide text-tinta-suave">{m.titulo}</p>
                  <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                    {m.lecciones.map((l) => (
                      <li key={l.id}>
                        <Link href={`${base}?leccion=${l.id}`} aria-current={l.id === actual?.id ? 'page' : undefined}
                          className="block rounded-md px-2 py-1.5 text-oliva-profundo no-underline hover:bg-arena aria-[current=page]:bg-arena aria-[current=page]:font-bold">
                          {l.titulo}{l.duracionMinutos ? <span className="text-[14px] text-tinta-suave"> · {l.duracionMinutos} min</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <section aria-labelledby="terminar-previa" className={tarjeta}>
              <h2 id="terminar-previa" className="m-0 text-[22px]">Para terminar el curso</h2>
              <ol className="m-0 mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[15px]">{requisitosParaAlumno(config).map((r) => <li key={r}>{r}</li>)}</ol>
              <p className="m-0 mt-3 text-[14px] text-tinta-suave">{textoAcceso({ duracionMeses: c.duracionComercialMeses, mesesAdicionales: 5 })}.</p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
