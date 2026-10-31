import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { clienteSesion } from '@/datos/supabase';
import { UUID } from '@/dominio/cursos-admin';
import { AvisoAccion } from '@/ui/admin/campos';
import { aplicarRevision, calcularRevision } from '../../../../acciones';

export const metadata: Metadata = { title: 'Revisión favorable' };

type Props = { params: Promise<{ id: string; pregunta: string }>; searchParams: Promise<{ ok?: string; error?: string; calculo?: string }> };

type Impacto = { intento: string; nombre: string | null; numero: number; puntaje_original: number; puntaje_vigente: number; puntaje_corregido: number;
  aprobado_antes: boolean; aprobado_despues: boolean }[];
type Revision = { id: string; version_id: string; opciones_correctas: string[]; motivo: string; estado: 'calculada' | 'aplicada' | 'descartada';
  impacto: Impacto; calculada_en: string; aplicada_en: string | null };

const fecha = (d: string) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(new Date(d));

/**
 * Revisión favorable en dos pasos distintos: (1) calcular el impacto, sin cambiar nada;
 * (2) aplicarlo escribiendo CORREGIR y la cantidad de intentos beneficiados. Solo sube resultados.
 */
export default async function RevisionFavorable({ params, searchParams }: Props) {
  const [{ id, pregunta }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  const p = c?.evaluacion?.preguntas.find((x) => x.id === pregunta);
  if (!c || !p || p.versiones.length === 0) notFound();
  const versiones = c.versiones.filter((v) => p.versiones.includes(v.numero)).sort((a, b) => b.numero - a.numero);
  const numero = new Map(c.versiones.map((v) => [v.id, v.numero]));
  const texto = new Map(p.opciones.map((o) => [o.id, o.texto]));
  const { data } = await (await clienteSesion()).from('revisiones_evaluacion')
    .select('id, version_id, opciones_correctas, motivo, estado, impacto, calculada_en, aplicada_en')
    .eq('pregunta_id', p.id).order('calculada_en', { ascending: false });
  const revisiones = (data ?? []) as Revision[];
  const calculo = aviso.calculo && UUID.test(aviso.calculo) ? revisiones.find((r) => r.id === aviso.calculo && r.estado === 'calculada') : undefined;
  const aplicadas = revisiones.filter((r) => r.estado === 'aplicada');
  const base = `/admin/cursos/${c.id}/evaluacion/${p.id}`;

  return (
    <>
      <Link href={base} className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 font-bold text-oliva-profundo no-underline hover:underline">
        <span aria-hidden="true">←</span> Volver a la pregunta
      </Link>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <h2 className="m-0 text-[26px]">Revisión favorable</h2>
      <p className="m-0 mt-1 max-w-[860px] text-tinta-suave">«{p.enunciado}»</p>
      <p className="m-0 mb-5 mt-3 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
        Si la clave de esta pregunta tenía un error, puede aceptar también otra respuesta en una versión publicada. La revisión
        <b> solo puede subir resultados</b>: nunca baja un puntaje ni revoca un certificado. El resultado original de cada intento se
        conserva junto al corregido, y todo queda registrado con su nombre, la fecha y el motivo.
      </p>

      {calculo ? (
        <section aria-labelledby="impacto" className="max-w-[980px] rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h3 id="impacto" className="m-0 text-[22px]">Paso 2 de 2 · Revise el impacto y confirme</h3>
          <dl className="m-0 mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[15px] sm:grid-cols-[180px_1fr]">
            <dt className="font-bold">Versión</dt><dd className="m-0">{numero.get(calculo.version_id)}</dd>
            <dt className="font-bold">Error corregido</dt><dd className="m-0">Se aceptará también: {calculo.opciones_correctas.map((o) => `«${texto.get(o) ?? o}»`).join(' y ')}</dd>
            <dt className="font-bold">Motivo</dt><dd className="m-0">{calculo.motivo}</dd>
            <dt className="font-bold">Calculada</dt><dd className="m-0">{fecha(calculo.calculada_en)}</dd>
          </dl>
          {calculo.impacto.length === 0 ? (
            <p className="m-0 mt-4">Ningún intento anterior mejora con este cambio. Si la aplica, la clave corregida valdrá para los intentos futuros de esta versión.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
                <caption className="mb-2 text-left font-bold">{calculo.impacto.length === 1 ? '1 intento mejora' : `${calculo.impacto.length} intentos mejoran`}</caption>
                <thead>
                  <tr className="border-b-[1.5px] border-borde-bandeja text-tinta-suave">
                    <th scope="col" className="py-2 pr-4">Alumno</th><th scope="col" className="py-2 pr-4">Intento</th>
                    <th scope="col" className="py-2 pr-4">Puntaje</th><th scope="col" className="py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {calculo.impacto.map((f) => (
                    <tr key={f.intento} className="border-b border-borde-bandeja">
                      <td className="py-2 pr-4">{f.nombre ?? 'Sin nombre'}</td>
                      <td className="py-2 pr-4">{f.numero}</td>
                      <td className="py-2 pr-4">{f.puntaje_vigente} → <b>{f.puntaje_corregido}</b></td>
                      <td className="py-2">{f.aprobado_antes ? 'Aprobado (sin cambio)' : f.aprobado_despues ? <b>Pasa a aprobado</b> : 'Sigue sin aprobar'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={aplicarRevision} className="mt-6 flex flex-col gap-3 border-t border-borde-bandeja pt-5">
            <input type="hidden" name="curso" value={c.id} />
            <input type="hidden" name="pregunta" value={p.id} />
            <input type="hidden" name="revision" value={calculo.id} />
            <label htmlFor="confirmar-revision" className="font-bold">Para aplicar, escriba CORREGIR {calculo.impacto.length}</label>
            <input id="confirmar-revision" name="confirmacion" required autoComplete="off"
              className="min-h-[50px] max-w-[320px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 uppercase text-marron" />
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="min-h-[48px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">Aplicar la revisión favorable</button>
              <Link href={`${base}/revision`} className="inline-flex min-h-[48px] items-center rounded-md border-2 border-oliva-profundo px-5 font-bold text-oliva-profundo no-underline">Volver sin aplicar</Link>
            </div>
          </form>
        </section>
      ) : (
        <section aria-labelledby="calcular" className="max-w-[860px] rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h3 id="calcular" className="m-0 text-[22px]">Paso 1 de 2 · Calcular el impacto</h3>
          <p className="m-0 mt-1 text-[15px] text-tinta-suave">Este paso no cambia ningún resultado: muestra a quién beneficiaría.</p>
          <form action={calcularRevision} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="curso" value={c.id} />
            <input type="hidden" name="pregunta" value={p.id} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="version" className="font-bold">Versión</label>
              <select id="version" name="version" defaultValue={versiones[0]?.id}
                className="min-h-[50px] max-w-[320px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron">
                {versiones.map((v) => <option key={v.id} value={v.id}>Versión {v.numero}{v.vigente ? ' (vigente)' : ''}</option>)}
              </select>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 font-bold">{p.tipo === 'unica' ? 'Respuesta que también se aceptará' : 'Combinación que también se aceptará'}</legend>
              {p.opciones.map((o) => (
                <label key={o.id} className="flex items-start gap-3">
                  <input type={p.tipo === 'unica' ? 'radio' : 'checkbox'} name="opciones" value={o.id} required={p.tipo === 'unica'} className="mt-1 h-5 w-5 shrink-0 accent-[#4E6049]" />
                  <span>{o.texto}{o.esCorrecta && <span className="text-tinta-suave"> · correcta en la clave original</span>}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="motivo" className="font-bold">Motivo (queda registrado)</label>
              <textarea id="motivo" name="motivo" required minLength={10} maxLength={500} rows={3}
                className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 py-3 text-marron" />
            </div>
            <div><button type="submit" className="min-h-[48px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-5 font-bold text-oliva-profundo hover:bg-arena">Calcular el impacto</button></div>
          </form>
        </section>
      )}

      {aplicadas.length > 0 && (
        <section aria-labelledby="aplicadas" className="mt-6 max-w-[860px]">
          <h3 id="aplicadas" className="m-0 text-[20px]">Revisiones aplicadas</h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {aplicadas.map((r) => (
              <li key={r.id} className="rounded-xl bg-marfil px-4 py-3 text-[15px]">
                Versión {numero.get(r.version_id)} · acepta también {r.opciones_correctas.map((o) => `«${texto.get(o) ?? o}»`).join(' y ')} ·
                {r.aplicada_en ? ` aplicada el ${fecha(r.aplicada_en)}` : ''} · {r.impacto.length === 1 ? '1 intento mejorado' : `${r.impacto.length} intentos mejorados`}.
                <span className="block text-tinta-suave">Motivo: {r.motivo}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
