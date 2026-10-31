import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { temasConUnaPregunta } from '@/dominio/cursos-admin';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoChip } from '@/ui/admin/estructura';
import { BotonesOrden } from '@/ui/admin/BotonesOrden';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { eliminarElemento, retirarElemento } from '../../acciones';
import { FormCriterios } from './FormCriterios';

export const metadata: Metadata = { title: 'Evaluación' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function Evaluacion({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  if (!c) notFound();
  const ev = c.evaluacion;
  const preguntas = ev?.preguntas ?? [];
  const volver = `/admin/cursos/${c.id}/evaluacion`;
  const temasSolos = temasConUnaPregunta(preguntas);
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      {ev && ev.intentos > 0 && (
        <p className="m-0 mb-5 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
          Esta evaluación ya tiene {ev.intentos === 1 ? '1 intento' : `${ev.intentos} intentos`}. Los cambios valen para los intentos futuros:
          los puntajes y certificados anteriores no se recalculan. Las preguntas respondidas se pueden retirar, no eliminar.
        </p>
      )}
      <div className="grid items-start gap-8 xl:grid-cols-[1fr_380px]">
        <section aria-labelledby="preguntas">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="preguntas" className="m-0 text-[24px]">Preguntas</h2>
            <Link href={`${volver}/nueva`} className="inline-flex min-h-[46px] items-center rounded-md bg-oliva-profundo px-5 font-bold text-marfil no-underline hover:bg-marron">+ Nueva pregunta</Link>
          </div>
          {temasSolos.length > 0 && (
            <p className="m-0 mb-4 rounded-xl border-[1.5px] border-[#D9C48C] bg-[#F5EBCF] px-4 py-3 text-[15px] text-[#6B5420]">
              {temasSolos.length === 1 ? 'El tema' : 'Los temas'} <b>{temasSolos.join(', ')}</b> {temasSolos.length === 1 ? 'tiene' : 'tienen'} una sola pregunta.
              Al informar «temas a reforzar», el alumno sabría cuál falló. Se recomienda que cada tema agrupe al menos dos preguntas.
            </p>
          )}
          {preguntas.length === 0 ? (
            <div className="rounded-2xl bg-arena p-6"><p className="m-0">Todavía no hay preguntas. Un curso necesita al menos una para publicarse.</p></div>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {preguntas.map((p, i) => {
                const sinCorrecta = !p.opciones.some((o) => o.esCorrecta);
                return (
                  <li key={p.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-[1.5px] border-borde-bandeja px-4 py-3.5 ${p.retirada ? 'bg-[#F1EEE8]' : 'bg-blanco-calido'}`}>
                    <BotonesOrden tabla="preguntas" id={p.id} curso={c.id} volver={volver} nombre={p.enunciado} primero={i === 0} ultimo={i === preguntas.length - 1} />
                    <div className="min-w-0 flex-[1_1_300px]">
                      <p className={`m-0 font-bold ${p.retirada ? 'text-tinta-suave line-through decoration-1' : ''}`}>{i + 1}. {p.enunciado}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13.5px] text-tinta-suave">
                        {p.retirada && <EstadoChip estado="archivado" texto="Retirada" />}
                        {sinCorrecta && !p.retirada && <EstadoChip estado="error" texto="Sin respuesta correcta" />}
                        <span>{p.tipo === 'unica' ? 'Opción única' : 'Opción múltiple'} · {p.opciones.length} opciones</span>
                        {p.tema && <span>· tema: {p.tema}</span>}
                        {p.respuestas > 0 && <span>· respondida {p.respuestas} {p.respuestas === 1 ? 'vez' : 'veces'}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3">
                      <Link href={`${volver}/${p.id}`} className="inline-flex min-h-[40px] items-center px-1 font-bold text-oliva-profundo underline underline-offset-4">Editar</Link>
                      {p.retirada ? (
                        <ConfirmarAccion accion={retirarElemento} campos={{ tabla: 'preguntas', id: p.id, curso: c.id, volver, retirar: 'no' }} textoBoton="Restaurar" titulo="¿Restaurar la pregunta?" estilo="enlace">
                          <p className="m-0">Vuelve a formar parte de la evaluación en los intentos futuros.</p>
                        </ConfirmarAccion>
                      ) : (
                        <ConfirmarAccion accion={retirarElemento} campos={{ tabla: 'preguntas', id: p.id, curso: c.id, volver, retirar: 'si' }} textoBoton="Retirar" titulo="¿Retirar la pregunta?" estilo="enlace">
                          <p className="m-0">Deja de aparecer y de contar en los intentos futuros. Los intentos anteriores conservan su puntaje.</p>
                        </ConfirmarAccion>
                      )}
                      {p.respuestas === 0 && (
                        <ConfirmarAccion accion={eliminarElemento} campos={{ tabla: 'preguntas', id: p.id, curso: c.id, volver }} textoBoton="Eliminar" titulo="¿Eliminar la pregunta?" palabra="ELIMINAR" peligro estilo="enlacePeligro">
                          <p className="m-0">Nadie la respondió todavía: se borra con sus opciones.</p>
                        </ConfirmarAccion>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <FormCriterios curso={c.id} criterios={{
          puntaje: String(ev?.puntajeMinimo ?? 70), intentos: ev?.intentosPermitidos ? String(ev.intentosPermitidos) : '',
          aprobado: ev?.mensajeAprobado ?? 'Aprobó la evaluación.', desaprobado: ev?.mensajeDesaprobado ?? 'Todavía no alcanzó el puntaje mínimo.',
        }} conIntentos={(ev?.intentos ?? 0) > 0} />
      </div>
    </>
  );
}
