import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cambioDeVersion, cursoCampus } from '@/datos/campus';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { Aviso } from '@/ui/Formulario';
import { cambiarDeVersion } from '../../../acciones';
import { requisitosParaAlumno } from '@/dominio/evaluacion';

export const metadata: Metadata = { title: 'Versión más reciente' };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ aviso?: string }> };

const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' }).format(d);

/** El alumno ve qué cambia y confirma expresamente. Nunca es automático. */
export default async function CambiarVersion({ params, searchParams }: Props) {
  const [{ slug }, { aviso }] = await Promise.all([params, searchParams]);
  const curso = await cursoCampus(slug);
  if (!curso) notFound();
  const c = await cambioDeVersion(curso.id);
  if (!c) redirect(`/campus/cursos/${slug}`);
  const intentos = (n: number | null) => (n === null ? 'sin límite' : n === 1 ? '1 intento' : `${n} intentos`);
  const modalidadCambia = c.requisitos ? c.requisitos.antes.modalidad !== c.requisitos.despues.modalidad : false;
  const criteriosCambian = c.puntajeMinimo.antes !== c.puntajeMinimo.despues || c.intentosPermitidos.antes !== c.intentosPermitidos.despues;

  return (
    <>
      <EncabezadoCampus
        titulo={`Pasar a la versión ${c.nueva.numero}`}
        volver={{ href: `/campus/cursos/${slug}`, texto: curso.titulo }}
        bajada={`Usted sigue la versión ${c.actual.numero}. La versión ${c.nueva.numero} se publicó el ${fecha(c.nueva.publicadaEn)}. Cambiar es opcional.`}
      />
      <Contenedor className="pb-20 pt-2">
        <div className="flex max-w-[760px] flex-col gap-5">
          {aviso === 'error' && <Aviso tipo="error">No se pudo hacer el cambio. Revise que haya marcado la confirmación e intente de nuevo.</Aviso>}
          {c.nueva.resumen && (
            <p className="m-0 rounded-xl bg-arena px-5 py-4"><b>Qué cambió, según la maestra:</b> {c.nueva.resumen}</p>
          )}

          <section aria-labelledby="que-cambia" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
            <h2 id="que-cambia" className="m-0 text-[22px]">Qué cambia para usted</h2>
            <ul className="m-0 mt-3 flex list-disc flex-col gap-2 pl-5">
              <li>
                {c.pendientesDespues === 0
                  ? 'No tendrá lecciones nuevas por completar.'
                  : `Tendrá ${c.pendientesDespues === 1 ? '1 lección' : `${c.pendientesDespues} lecciones`} por completar en la versión nueva.`}
                {c.leccionesNuevas.length > 0 && <> Nuevas: {c.leccionesNuevas.join(', ')}.</>}
              </li>
              {c.leccionesQuitadas.length > 0 && <li>Ya no forman parte del programa: {c.leccionesQuitadas.join(', ')}.</li>}
              <li>Conserva {c.completadasConservadas === 1 ? '1 lección completada' : `${c.completadasConservadas} lecciones completadas`} que siguen en la versión nueva.</li>
              {modalidadCambia ? (
                <li>
                  Cambia la forma de evaluar: {c.requisitos!.despues.modalidad === 'formativa' ? 'pasa a ser formativa, sin nota' : 'pasa a ser una evaluación final con puntaje'}.
                  {' '}Para terminar la versión nueva deberá cumplir: {requisitosParaAlumno({ ...c.requisitos!.despues, puntajeMinimo: c.puntajeMinimo.despues, intentosPermitidos: c.intentosPermitidos.despues })
                    .slice(1).join(' ')}
                </li>
              ) : c.requisitos?.despues.modalidad === 'formativa' ? (
                <li>Para terminar la versión nueva: {requisitosParaAlumno({ ...c.requisitos.despues, puntajeMinimo: c.puntajeMinimo.despues, intentosPermitidos: c.intentosPermitidos.despues }).join(' ')}</li>
              ) : (
                <li>
                  {c.evaluacionIgual
                    ? 'La evaluación final es la misma: si ya la aprobó, su aprobación se reconoce.'
                    : 'La evaluación final cambió: para el certificado de la versión nueva deberá aprobarla de nuevo.'}
                </li>
              )}
              {!modalidadCambia && c.requisitos?.despues.modalidad !== 'formativa' && criteriosCambian && (
                <li>Criterios: puntaje mínimo {c.puntajeMinimo.antes} → {c.puntajeMinimo.despues}; intentos {intentos(c.intentosPermitidos.antes)} → {intentos(c.intentosPermitidos.despues)}.</li>
              )}
            </ul>
          </section>

          <section aria-labelledby="que-se-conserva" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
            <h2 id="que-se-conserva" className="m-0 text-[22px]">Qué se conserva siempre</h2>
            <p className="m-0 mt-2">
              Sus lecciones completadas, sus intentos y resultados anteriores{c.tieneCertificado ? ' y su certificado de la versión ' + c.actual.numero : ''}.
              Nada se borra. El cambio no se puede deshacer: no podrá volver a la versión {c.actual.numero}.
            </p>
          </section>

          <form action={cambiarDeVersion} className="flex flex-col gap-4 rounded-2xl bg-arena p-6">
            <input type="hidden" name="curso" value={slug} />
            <input type="hidden" name="destino" value={c.nueva.id} />
            <label className="flex items-start gap-3 text-[16px]">
              <input type="checkbox" name="entiendo" value="si" required className="mt-1 h-5 w-5 shrink-0 accent-[#4E6049]" />
              <span>Entiendo qué cambia y quiero pasar de la versión {c.actual.numero} a la versión {c.nueva.numero}.</span>
            </label>
            <div>
              <button type="submit" className="min-h-[54px] rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil hover:bg-marron">
                Pasar a la versión {c.nueva.numero}
              </button>
            </div>
          </form>
        </div>
      </Contenedor>
    </>
  );
}
