import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin, type LeccionAdmin, type ModuloAdmin } from '@/datos/admin-cursos';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoChip } from '@/ui/admin/estructura';
import { BotonesOrden } from '@/ui/admin/BotonesOrden';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { corregirModulo, crearLeccion, crearModulo, eliminarElemento, renombrarModulo, retirarElemento } from '../../acciones';
import { TIPOS_CORRECCION } from '@/dominio/cursos-admin';

export const metadata: Metadata = { title: 'Temario' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const chip = 'inline-flex items-center rounded-full border border-borde-bandeja bg-marfil px-2.5 text-[12.5px]';

function AccionesRetiro({ tabla, id, curso, volver, nombre, retirado, historial, tipo, versionado, enVersion }: {
  tabla: 'modulos' | 'lecciones'; id: string; curso: string; volver: string; nombre: string; retirado: boolean; historial: number; tipo: string;
  versionado: boolean; enVersion: boolean;
}) {
  const campos = { tabla, id, curso, volver };
  if (retirado) {
    return (
      <ConfirmarAccion accion={retirarElemento} campos={{ ...campos, retirar: 'no' }} textoBoton="Restaurar" titulo={`¿Restaurar ${tipo}?`} estilo="enlace">
        <p className="m-0">{versionado
          ? `«${nombre}» vuelve al borrador: formará parte de la próxima versión que publique.`
          : `«${nombre}» vuelve a verse en el sitio y en el campus, y vuelve a contar para terminar el curso.`}</p>
      </ConfirmarAccion>
    );
  }
  return (
    <>
      <ConfirmarAccion accion={retirarElemento} campos={{ ...campos, retirar: 'si' }} textoBoton="Retirar" titulo={`¿Retirar ${tipo}?`} estilo="enlace">
        {versionado ? (
          <>
            <p className="m-0">«{nombre}» sale del borrador: no formará parte de la próxima versión que publique.</p>
            <p className="m-0">Quienes siguen una versión publicada que lo incluye lo siguen viendo. El avance y los certificados no cambian. Puede restaurarlo cuando quiera.</p>
          </>
        ) : (
          <>
            <p className="m-0">«{nombre}» deja de verse en el sitio y en el campus y deja de contar para terminar el curso.</p>
            <p className="m-0">El avance de los alumnos se conserva y los certificados emitidos no cambian. Puede restaurarlo cuando quiera.</p>
          </>
        )}
      </ConfirmarAccion>
      {historial === 0 && !enVersion && (
        <ConfirmarAccion accion={eliminarElemento} campos={campos} textoBoton="Eliminar" titulo={`¿Eliminar ${tipo}?`} palabra="ELIMINAR" peligro estilo="enlacePeligro">
          <p className="m-0">«{nombre}» se borra definitivamente{tabla === 'modulos' ? ', con sus lecciones y materiales' : ', con sus materiales'}. Nadie lo había visto todavía.</p>
        </ConfirmarAccion>
      )}
    </>
  );
}

function FilaLeccion({ l, curso, volver, primero, ultimo, numero, versionado }: { l: LeccionAdmin; curso: string; volver: string; primero: boolean; ultimo: boolean; numero: number; versionado: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3 ${l.retirada ? 'bg-[#F1EEE8]' : ''}`}>
      <BotonesOrden tabla="lecciones" id={l.id} curso={curso} volver={volver} nombre={l.titulo} primero={primero} ultimo={ultimo} />
      <div className="min-w-0 flex-[1_1_260px]">
        <p className={`m-0 font-bold ${l.retirada ? 'text-tinta-suave line-through decoration-1' : ''}`}>{numero}. {l.titulo}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13.5px] text-tinta-suave">
          {l.retirada && <EstadoChip estado="archivado" texto={versionado ? 'Retirada del borrador' : 'Retirada'} />}
          {l.marca.bloqueada && <EstadoChip estado="pendiente" texto="Bloqueada" />}
          {versionado && !l.retirada && !l.marca.enVigente && <span className={chip}>Nueva en el borrador</span>}
          {l.duracionMinutos && <span>{l.duracionMinutos} min ·</span>}
          {l.videoId ? <span className={chip}>Video cargado</span> : <EstadoChip estado="pendiente" texto="Video pendiente" />}
          <span className={chip}>{l.materiales.length === 0 ? 'Sin PDF' : l.materiales.length === 1 ? '1 PDF' : `${l.materiales.length} PDF`}</span>
          {l.vistas > 0 && <span>· vista por {l.vistas} {l.vistas === 1 ? 'alumno' : 'alumnos'}, {l.completadas === 1 ? '1 la completó' : `${l.completadas} la completaron`}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3">
        <Link href={`/admin/cursos/${curso}/temario/${l.id}`} className="inline-flex min-h-[40px] items-center px-1 font-bold text-oliva-profundo underline underline-offset-4">Editar</Link>
        <AccionesRetiro tabla="lecciones" id={l.id} curso={curso} volver={volver} nombre={l.titulo} retirado={l.retirada} historial={l.vistas} tipo="la lección"
          versionado={versionado} enVersion={l.marca.enAlgunaVersion} />
      </div>
    </li>
  );
}

function TarjetaModulo({ m, i, total, curso, volver, avisoNueva, versionado }: { m: ModuloAdmin; i: number; total: number; curso: string; volver: string; avisoNueva: string | null; versionado: boolean }) {
  const historial = m.lecciones.reduce((t, l) => t + l.vistas, 0);
  return (
    <section aria-label={`Módulo ${i + 1}: ${m.titulo}`} className={`rounded-2xl border-[1.5px] border-borde-bandeja p-3 sm:p-4 ${m.retirado ? 'bg-[#F1EEE8]' : 'bg-blanco-calido'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-1 pb-2">
        <BotonesOrden tabla="modulos" id={m.id} curso={curso} volver={volver} nombre={m.titulo} primero={i === 0} ultimo={i === total - 1} />
        {m.lecciones.some((l) => l.marca.enAlgunaVersion) ? (
          <div className="flex min-w-0 flex-[1_1_300px] flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="m-0 font-display text-[19px] font-semibold">Módulo {i + 1} · {m.titulo}</h2>
            <ConfirmarAccion accion={corregirModulo} campos={{ id: m.id, curso }} textoBoton="Corregir nombre" titulo="Corrección menor del nombre" estilo="enlace" textoConfirmar="Aplicar corrección">
              <p className="m-0">El módulo forma parte de una versión publicada: su nombre solo admite correcciones menores, que se ven en todas las versiones y quedan registradas.</p>
              <label htmlFor={`titulo-${m.id}`} className="mt-1 text-[15px] font-bold">Nombre corregido</label>
              <input id={`titulo-${m.id}`} name="titulo" defaultValue={m.titulo} required minLength={2} maxLength={140}
                className="min-h-[48px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron" />
              <label htmlFor={`tipo-${m.id}`} className="text-[15px] font-bold">Tipo de corrección</label>
              <select id={`tipo-${m.id}`} name="tipo_correccion" required defaultValue="" className="min-h-[48px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron">
                <option value="" disabled>Elija una opción</option>
                {TIPOS_CORRECCION.filter((t) => !t.valor.includes('video') && t.valor !== 'calidad_audio_video').map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
              </select>
              <label htmlFor={`motivo-${m.id}`} className="text-[15px] font-bold">Motivo (queda registrado)</label>
              <textarea id={`motivo-${m.id}`} name="motivo" required minLength={10} maxLength={500} rows={2}
                className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 py-2 text-marron" />
            </ConfirmarAccion>
          </div>
        ) : (
          <form action={renombrarModulo} className="flex min-w-0 flex-[1_1_300px] items-center gap-2">
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="curso" value={curso} />
            <label htmlFor={`modulo-${m.id}`} className="shrink-0 font-display text-[19px] font-semibold">Módulo {i + 1} ·</label>
            <input id={`modulo-${m.id}`} name="titulo" defaultValue={m.titulo} required minLength={2} maxLength={140}
              className="min-h-[44px] min-w-0 flex-1 rounded-md border-[1.5px] border-transparent bg-transparent px-2 font-display text-[19px] font-semibold text-marron hover:border-borde-bandeja focus:border-borde-control focus:bg-blanco-calido" />
            <button type="submit" className="min-h-[40px] shrink-0 px-1 text-[15px] font-bold text-oliva-profundo underline underline-offset-4">Guardar nombre</button>
          </form>
        )}
        <div className="flex items-center gap-x-3">
          {m.retirado && <EstadoChip estado="archivado" texto="Retirado" />}
          <AccionesRetiro tabla="modulos" id={m.id} curso={curso} volver={volver} nombre={m.titulo} retirado={m.retirado} historial={historial} tipo="el módulo"
            versionado={versionado} enVersion={m.lecciones.some((l) => l.marca.enAlgunaVersion)} />
        </div>
      </div>
      {m.lecciones.length > 0 && (
        <ol className="m-0 flex list-none flex-col divide-y divide-[#EFE7D6] p-0 sm:pl-10">
          {m.lecciones.map((l, j) => (
            <FilaLeccion key={l.id} l={l} curso={curso} volver={volver} primero={j === 0} ultimo={j === m.lecciones.length - 1} numero={j + 1} versionado={versionado} />
          ))}
        </ol>
      )}
      {!m.retirado && (
        <form action={crearLeccion} className="mt-2 flex flex-wrap items-end gap-3 px-1 sm:pl-12">
          <input type="hidden" name="curso" value={curso} />
          <input type="hidden" name="modulo" value={m.id} />
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
            <label htmlFor={`nueva-${m.id}`} className="text-[14px] font-bold">Nueva lección en este módulo</label>
            <input id={`nueva-${m.id}`} name="titulo" required minLength={2} maxLength={140} placeholder="Título de la lección"
              className="min-h-[46px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron" />
          </div>
          <button type="submit" className="min-h-[46px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-4 font-bold text-oliva-profundo hover:bg-arena">+ Agregar lección</button>
          {avisoNueva && <p className="m-0 basis-full text-[14px] text-[#6B5420]">{avisoNueva}</p>}
        </form>
      )}
    </section>
  );
}

export default async function Temario({ params, searchParams }: Props) {
  const [{ id }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  if (!c) notFound();
  const volver = `/admin/cursos/${c.id}/temario`;
  const pendientes = c.historial.alumnosSinCertificado;
  const versionado = c.versiones.length > 0;
  const avisoNueva = !versionado && pendientes > 0
    ? `Atención: ${pendientes === 1 ? '1 alumno sin certificado deberá' : `${pendientes} alumnos sin certificado deberán`} completar también la lección nueva para terminar el curso. Los certificados emitidos no cambian.`
    : null;
  return (
    <>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      {versionado ? (
        <p className="m-0 mb-5 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
          Está editando el <b>borrador</b>. Agregar, retirar o reordenar lecciones no cambia nada para los alumnos hasta que publique una
          versión nueva en <Link href={`/admin/cursos/${c.id}/publicacion`} className="font-bold text-oliva-profundo">Publicación</Link>.
          Una lección o un módulo publicado solo admite correcciones menores declaradas (se ven en todas las versiones y quedan registradas); para cambiar su contenido se crea una lección de reemplazo.
        </p>
      ) : c.historial.alumnos > 0 && (
        <p className="m-0 mb-5 max-w-[860px] rounded-xl bg-arena px-5 py-3.5 text-[15px]">
          Este curso tiene alumnos. Lo que alguien ya vio no se puede eliminar: se <b>retira</b>, deja de contar y su historial se conserva.
        </p>
      )}
      <div className="flex max-w-[980px] flex-col gap-4">
        {c.modulos.map((m, i) => (
          <TarjetaModulo key={m.id} m={m} i={i} total={c.modulos.length} curso={c.id} volver={volver} avisoNueva={avisoNueva} versionado={versionado} />
        ))}
        {c.modulos.length === 0 && (
          <div className="rounded-2xl bg-arena p-6"><p className="m-0">Todavía no hay módulos. Un módulo agrupa lecciones sobre un mismo tema.</p></div>
        )}
        <form action={crearModulo} className="flex flex-wrap items-end gap-3 rounded-2xl border-[1.5px] border-dashed border-borde-bandeja p-4">
          <input type="hidden" name="curso" value={c.id} />
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
            <label htmlFor="nuevo-modulo" className="text-[14px] font-bold">Nuevo módulo</label>
            <input id="nuevo-modulo" name="titulo" required minLength={2} maxLength={140} placeholder="Por ejemplo: Observar y preparar"
              className="min-h-[46px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron" />
          </div>
          <button type="submit" className="min-h-[46px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">+ Agregar módulo</button>
        </form>
      </div>
    </>
  );
}
