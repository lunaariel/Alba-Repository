import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoChip } from '@/ui/admin/estructura';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { BloqueoExcepcional } from '@/ui/admin/BloqueoExcepcional';
import { asociarComplemento, bloquearContenido, quitarMaterial, reemplazarLeccion } from '../../../acciones';
import { FormLeccion } from './FormLeccion';
import { SubirMaterial } from './SubirMaterial';

export const metadata: Metadata = { title: 'Lección' };

type Props = { params: Promise<{ id: string; leccion: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const peso = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function EditarLeccion({ params, searchParams }: Props) {
  const [{ id, leccion }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  const modulo = c?.modulos.find((m) => m.lecciones.some((l) => l.id === leccion));
  const l = modulo?.lecciones.find((x) => x.id === leccion);
  if (!c || !modulo || !l) notFound();
  const volver = `/admin/cursos/${c.id}/temario/${l.id}`;
  return (
    <>
      <Link href={`/admin/cursos/${c.id}/temario`} className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 font-bold text-oliva-profundo no-underline hover:underline">
        <span aria-hidden="true">←</span> Volver al temario
      </Link>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-[26px]">{l.titulo}</h2>
        {l.retirada && <EstadoChip estado="archivado" texto={c.versiones.length ? 'Retirada del borrador' : 'Retirada'} />}
        {l.marca.bloqueada && <EstadoChip estado="pendiente" texto="Bloqueada" />}
        <span className="text-[15px] text-tinta-suave">Módulo: {modulo.titulo}{l.vistas > 0 ? ` · vista por ${l.vistas}, completada por ${l.completadas}` : ''}</span>
      </div>
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {l.marca.enAlgunaVersion && (
            <div className="rounded-xl bg-arena px-5 py-4 text-[15px]">
              <p className="m-0">
                Esta lección forma parte de {l.marca.versiones.length === 1 ? 'la versión publicada' : 'las versiones publicadas'} {l.marca.versiones.map((v) => v.numero).join(', ')}.
                Aquí solo se admiten <b>correcciones menores</b> (ortografía, redacción sin cambiar el sentido, formato, accesibilidad, enlaces, el mismo video con mejor calidad).
                Se ven en todas las versiones y quedan registradas con su tipo y motivo.
              </p>
              <p className="m-0 mt-2">
                Para un <b>cambio sustancial</b> (otro contenido, otro video, otro enfoque), cree una lección de reemplazo: queda en el borrador y llega a los alumnos con la próxima versión.
              </p>
              {!l.retirada && (
                <div className="mt-3">
                  <ConfirmarAccion accion={reemplazarLeccion} campos={{ id: l.id, curso: c.id }} textoBoton="Crear lección de reemplazo" titulo="¿Crear una lección de reemplazo?" palabra="REEMPLAZAR">
                    <p className="m-0">Se crea una copia de «{l.titulo}» en el borrador, en el mismo lugar, para editarla libremente. La original sale del borrador.</p>
                    <p className="m-0">Quienes siguen las versiones publicadas conservan la lección original. El cambio llega a los alumnos nuevos cuando publique una versión.</p>
                  </ConfirmarAccion>
                </div>
              )}
            </div>
          )}
          <FormLeccion publicada={l.marca.enAlgunaVersion} leccion={{ id: l.id, curso: c.id, titulo: l.titulo, descripcion: l.descripcion ?? '', duracion: l.duracionMinutos ? String(l.duracionMinutos) : '', video: l.videoId ?? '' }} />
        </div>
        <section aria-labelledby="materiales" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h3 id="materiales" className="m-0 text-[22px]">Materiales PDF</h3>
          <p className="m-0 mt-1 text-[14px] text-tinta-suave">Solo los descargan los alumnos del curso, con un enlace que vence en minutos.</p>
          {l.materiales.length > 0 ? (
            <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
              {l.materiales.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-marfil px-3 py-2">
                  <span><b className={m.retirado ? 'text-tinta-suave line-through decoration-1' : ''}>{m.titulo}</b> <span className="text-[13.5px] text-tinta-suave">· {peso(m.tamanoBytes)}</span>
                    {' '}<span className="inline-flex items-center rounded-full border border-borde-bandeja bg-blanco-calido px-2.5 text-[12.5px]">{m.complementario ? 'Complementario' : 'Parte del programa'}</span>
                    {m.retirado && <> <EstadoChip estado="archivado" texto="Retirado del borrador" /></>}
                    {m.bloqueado && <> <EstadoChip estado="pendiente" texto="Bloqueado en todas las versiones" /></>}
                    {m.bloqueado && m.bloqueoMotivo && <span className="block text-[13.5px] text-tinta-suave">Motivo: {m.bloqueoMotivo}</span>}</span>
                  {(m.enVersion || m.complementoDe.length > 0) && (
                    <ConfirmarAccion accion={bloquearContenido} campos={{ tabla: 'recursos_leccion', id: m.id, volver, bloquear: m.bloqueado ? 'no' : 'si' }}
                      textoBoton={m.bloqueado ? 'Desbloquear' : 'Bloquear'} estilo={m.bloqueado ? 'enlace' : 'enlacePeligro'} peligro={!m.bloqueado}
                      titulo={m.bloqueado ? '¿Desbloquear el material?' : '¿Bloquear el material en todas las versiones?'} palabra={m.bloqueado ? 'DESBLOQUEAR' : 'BLOQUEAR'}>
                      <p className="m-0">{m.bloqueado
                        ? `«${m.titulo}» vuelve a estar disponible en las versiones que lo incluyen.`
                        : `«${m.titulo}» deja de estar disponible para todos los alumnos, en todas las versiones, y deja de contar como requisito. Solo para material erróneo o dañino; para cambios normales, retírelo del borrador.`}</p>
                      <label htmlFor={`motivo-material-${m.id}`} className="mt-2 text-[15px] font-bold">Motivo (queda registrado)</label>
                      <textarea id={`motivo-material-${m.id}`} name="motivo" required minLength={10} maxLength={500} rows={3}
                        className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 py-3 text-marron" />
                    </ConfirmarAccion>
                  )}
                  {!m.retirado && (
                    <ConfirmarAccion accion={quitarMaterial} campos={{ id: m.id, volver }} textoBoton="Quitar" titulo="¿Quitar el material?" estilo="enlacePeligro" peligro textoConfirmar="Quitar">
                      <p className="m-0">{m.enVersion
                        ? `«${m.titulo}» sale del borrador. Como forma parte de una versión publicada, el archivo se conserva para quienes siguen esa versión.`
                        : m.complementoDe.length
                          ? `«${m.titulo}» es complementario: deja de estar disponible para los alumnos de las versiones a las que estaba asociado. No cambia avances ni certificados.`
                          : `«${m.titulo}» deja de estar disponible y el archivo se borra.`}</p>
                    </ConfirmarAccion>
                  )}
                  {m.complementario && !m.retirado && l.marca.versiones.length > 0 && (
                    <form action={asociarComplemento} className="flex basis-full flex-col gap-2 border-t border-borde-bandeja pt-2 text-[14.5px]">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="volver" value={volver} />
                      <span className="font-bold">Disponible para los alumnos de:</span>
                      <span className="flex flex-wrap gap-x-4 gap-y-1">
                        {l.marca.versiones.map((v) => (
                          <label key={v.id} className="flex min-h-[36px] items-center gap-2">
                            <input type="checkbox" name="versiones" value={v.id} defaultChecked={m.complementoDe.includes(v.id)} className="h-5 w-5 accent-[#4E6049]" />
                            Versión {v.numero}
                          </label>
                        ))}
                      </span>
                      <span><button type="submit" className="min-h-[40px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-3 font-bold text-oliva-profundo hover:bg-arena">Guardar versiones</button></span>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-4">Esta lección todavía no tiene materiales.</p>
          )}
          <SubirMaterial leccionId={l.id} publicada={l.marca.enAlgunaVersion} />
        </section>
      </div>
      {l.marca.enAlgunaVersion && (
        <BloqueoExcepcional accion={bloquearContenido} tabla="lecciones" id={l.id} volver={volver} nombre={l.titulo} tipo="la lección"
          bloqueada={l.marca.bloqueada} motivo={l.marca.bloqueoMotivo} />
      )}
    </>
  );
}
