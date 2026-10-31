import 'server-only';
import { cache } from 'react';
import { clienteServicio, clienteSesion } from './supabase';
import { exigirAdmin } from './sesion';

/**
 * Lecturas del editor de cursos. Todo con la sesión de la admin (RLS), salvo dos columnas que
 * ningún cliente lee (lecciones.video_id y opciones.es_correcta): esas se leen con la clave de
 * servicio, siempre después de exigirAdmin().
 */

export type EstadoCurso = 'borrador' | 'publicado' | 'archivado';

export interface CursoListado {
  id: string; slug: string; titulo: string; estado: EstadoCurso; precioCentavos: number;
  lecciones: number; alumnos: number; certificados: number; actualizadoEn: Date;
}

export async function listaCursos(): Promise<CursoListado[]> {
  await exigirAdmin();
  const s = await clienteSesion();
  const [{ data: cursos, error }, { data: accesos }, { data: certs }] = await Promise.all([
    s.from('cursos').select('id, slug, titulo, estado, precio_centavos, actualizado_en, modulos(retirado, lecciones(retirada))').order('actualizado_en', { ascending: false }),
    s.from('accesos_curso').select('curso_id').eq('estado', 'activo'),
    s.from('certificados').select('curso_id'),
  ]);
  if (error) throw new Error(`No se pudieron leer los cursos: ${error.message}`);
  const contar = (filas: { curso_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const f of filas ?? []) m.set(f.curso_id, (m.get(f.curso_id) ?? 0) + 1);
    return m;
  };
  const alumnos = contar(accesos as { curso_id: string }[] | null);
  const certificados = contar(certs as { curso_id: string }[] | null);
  type Fila = { id: string; slug: string; titulo: string; estado: EstadoCurso; precio_centavos: number; actualizado_en: string;
    modulos: { retirado: boolean; lecciones: { retirada: boolean }[] }[] };
  return ((cursos ?? []) as Fila[]).map((c) => ({
    id: c.id, slug: c.slug, titulo: c.titulo, estado: c.estado, precioCentavos: c.precio_centavos,
    lecciones: c.modulos.filter((m) => !m.retirado).flatMap((m) => m.lecciones).filter((l) => !l.retirada).length,
    alumnos: alumnos.get(c.id) ?? 0, certificados: certificados.get(c.id) ?? 0, actualizadoEn: new Date(c.actualizado_en),
  }));
}

export interface MaterialAdmin {
  id: string; titulo: string; ruta: string; tamanoBytes: number; retirado: boolean; enVersion: boolean; bloqueado: boolean;
  complementario: boolean; complementoDe: string[];
}
/** Dónde está cada pieza respecto de la versión vigente (para los marcadores del editor). */
export interface Marca { enVigente: boolean; enAlgunaVersion: boolean; bloqueada: boolean; bloqueoMotivo: string | null; versiones: { id: string; numero: number }[] }
export interface VersionAdmin {
  id: string; numero: number; publicadaEn: Date; resumen: string | null; puntajeMinimo: number; intentosPermitidos: number | null;
  alumnos: number; certificados: number; lecciones: number; preguntas: number; vigente: boolean; objetivos: string[];
}
export interface LeccionAdmin {
  id: string; titulo: string; descripcion: string | null; duracionMinutos: number | null; orden: number;
  retirada: boolean; videoId: string | null; materiales: MaterialAdmin[]; vistas: number; completadas: number; marca: Marca;
}
export interface ModuloAdmin { id: string; titulo: string; orden: number; retirado: boolean; lecciones: LeccionAdmin[] }
export interface OpcionAdmin { id: string; texto: string; orden: number; esCorrecta: boolean }
export interface PreguntaAdmin {
  id: string; enunciado: string; tipo: 'unica' | 'multiple'; tema: string | null; orden: number; retirada: boolean;
  opciones: OpcionAdmin[]; respuestas: number; marca: Marca; versiones: number[];
}
export interface EvaluacionAdmin {
  id: string; puntajeMinimo: number; intentosPermitidos: number | null; mensajeAprobado: string; mensajeDesaprobado: string;
  preguntas: PreguntaAdmin[]; intentos: number;
}
export interface CursoAdmin {
  id: string; slug: string; titulo: string; resumen: string | null; descripcion: string | null;
  publico: string[]; edadDesdeMeses: number | null; edadHastaMeses: number | null; duracionMinutos: number | null;
  objetivos: string[]; requisitos: string | null; precioCentavos: number; videoPresentacionId: string | null;
  estado: EstadoCurso; publicadoEn: Date | null;
  modulos: ModuloAdmin[]; evaluacion: EvaluacionAdmin | null;
  historial: { alumnos: number; alumnosSinCertificado: number; certificados: number; ordenes: number };
  versiones: VersionAdmin[];
  /** Lo que tiene la versión vigente y ya no está (o cambió) en el borrador. */
  quitadoDelBorrador: { lecciones: { id: string; titulo: string }[]; preguntas: { id: string; enunciado: string }[] };
}

/** Todo el curso, con lo retirado y con lo que el editor necesita para avisar del impacto. */
export const cursoAdmin = cache(async (id: string): Promise<CursoAdmin | null> => {
  await exigirAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const s = await clienteSesion();
  const { data: c } = await s.from('cursos')
    .select(`id, slug, titulo, resumen, descripcion, publico, edad_desde_meses, edad_hasta_meses, duracion_minutos, objetivos,
             requisitos, precio_centavos, video_presentacion_id, estado, publicado_en, version_vigente_id,
             modulos(id, titulo, orden, retirado, lecciones(id, titulo, descripcion, duracion_minutos, orden, retirada,
               recursos_leccion(id, titulo, ruta_almacenamiento, tamano_bytes, orden, retirado, complementario))),
             evaluaciones(id, puntaje_minimo, intentos_permitidos, mensaje_aprobado, mensaje_desaprobado,
               preguntas(id, enunciado, tipo, tema, orden, retirada, opciones(id, texto, orden)))`)
    .eq('id', id).maybeSingle();
  if (!c) return null;

  type L = { id: string; titulo: string; descripcion: string | null; duracion_minutos: number | null; orden: number; retirada: boolean;
    recursos_leccion: { id: string; titulo: string; ruta_almacenamiento: string; tamano_bytes: number; orden: number; retirado: boolean; complementario: boolean }[] };
  type M = { id: string; titulo: string; orden: number; retirado: boolean; lecciones: L[] };
  type P = { id: string; enunciado: string; tipo: 'unica' | 'multiple'; tema: string | null; orden: number; retirada: boolean;
    opciones: { id: string; texto: string; orden: number }[] };
  type E = { id: string; puntaje_minimo: number; intentos_permitidos: number | null; mensaje_aprobado: string; mensaje_desaprobado: string; preguntas: P[] };
  const modulos = (c.modulos ?? []) as M[];
  const evalFila = (Array.isArray(c.evaluaciones) ? c.evaluaciones[0] : c.evaluaciones) as E | null | undefined;
  const leccionIds = modulos.flatMap((m) => m.lecciones.map((l) => l.id));
  const preguntaIds = (evalFila?.preguntas ?? []).map((p) => p.id);
  const servicio = clienteServicio();

  const [videos, correctas, progreso, respuestas, accesos, certs, items, intentos, versiones, bloqueosPreguntas, bloqueosMateriales, complementos] = await Promise.all([
    leccionIds.length ? servicio.from('lecciones').select('id, video_id, bloqueada, bloqueo_motivo').in('id', leccionIds) : Promise.resolve({ data: [] }),
    preguntaIds.length ? servicio.from('opciones').select('id, es_correcta').in('pregunta_id', preguntaIds) : Promise.resolve({ data: [] }),
    leccionIds.length ? s.from('progreso_leccion').select('leccion_id, completada_en').in('leccion_id', leccionIds) : Promise.resolve({ data: [] }),
    preguntaIds.length ? s.from('respuestas_intento').select('pregunta_id').in('pregunta_id', preguntaIds) : Promise.resolve({ data: [] }),
    s.from('accesos_curso').select('perfil_id, version_id').eq('curso_id', id).eq('estado', 'activo'),
    s.from('certificados').select('perfil_id, version_id').eq('curso_id', id),
    s.from('items_orden').select('id', { count: 'exact', head: true }).eq('curso_id', id),
    evalFila ? s.from('intentos_evaluacion').select('id', { count: 'exact', head: true }).eq('evaluacion_id', evalFila.id) : Promise.resolve({ count: 0 }),
    servicio.from('versiones_curso')
      .select('id, numero, publicada_en, resumen, puntaje_minimo, intentos_permitidos, objetivos, version_lecciones(leccion_id), version_materiales(recurso_id), version_preguntas(pregunta_id)')
      .eq('curso_id', id).order('numero', { ascending: false }),
    preguntaIds.length ? servicio.from('preguntas').select('id, bloqueada, bloqueo_motivo').in('id', preguntaIds) : Promise.resolve({ data: [] }),
    leccionIds.length ? servicio.from('recursos_leccion').select('id, bloqueado').in('leccion_id', leccionIds) : Promise.resolve({ data: [] }),
    servicio.from('version_complementos').select('recurso_id, version_id, versiones_curso!inner(curso_id)').eq('versiones_curso.curso_id', id),
  ]);
  type FilaVersion = { id: string; numero: number; publicada_en: string; resumen: string | null; puntaje_minimo: number; intentos_permitidos: number | null; objetivos: string[];
    version_lecciones: { leccion_id: string }[]; version_materiales: { recurso_id: string }[]; version_preguntas: { pregunta_id: string }[] };
  const filasVersion = (versiones.data ?? []) as FilaVersion[];
  const vigente = filasVersion.find((v) => v.id === c.version_vigente_id);
  const enVigente = { lecciones: new Set(vigente?.version_lecciones.map((x) => x.leccion_id)), preguntas: new Set(vigente?.version_preguntas.map((x) => x.pregunta_id)) };
  const enAlguna = {
    lecciones: new Set(filasVersion.flatMap((v) => v.version_lecciones.map((x) => x.leccion_id))),
    materiales: new Set(filasVersion.flatMap((v) => v.version_materiales.map((x) => x.recurso_id))),
  };
  const versionesDeLeccion = new Map<string, { id: string; numero: number }[]>();
  for (const v of [...filasVersion].sort((a, b) => a.numero - b.numero)) for (const x of v.version_lecciones) {
    versionesDeLeccion.set(x.leccion_id, [...(versionesDeLeccion.get(x.leccion_id) ?? []), { id: v.id, numero: v.numero }]);
  }
  const complementoDe = new Map<string, string[]>();
  for (const x of (complementos.data ?? []) as { recurso_id: string; version_id: string }[]) complementoDe.set(x.recurso_id, [...(complementoDe.get(x.recurso_id) ?? []), x.version_id]);
  const versionesDePregunta = new Map<string, number[]>();
  for (const v of filasVersion) for (const x of v.version_preguntas) versionesDePregunta.set(x.pregunta_id, [...(versionesDePregunta.get(x.pregunta_id) ?? []), v.numero]);
  const bloqueoLeccion = new Map(((videos.data ?? []) as { id: string; bloqueada: boolean; bloqueo_motivo: string | null }[]).map((v) => [v.id, v]));
  const bloqueoPregunta = new Map(((bloqueosPreguntas.data ?? []) as { id: string; bloqueada: boolean; bloqueo_motivo: string | null }[]).map((v) => [v.id, v]));
  const materialBloqueado = new Set(((bloqueosMateriales.data ?? []) as { id: string; bloqueado: boolean }[]).filter((m) => m.bloqueado).map((m) => m.id));
  const alumnosPorVersion = new Map<string, number>(); const certsPorVersion = new Map<string, number>();
  for (const a of (accesos.data ?? []) as { version_id: string }[]) alumnosPorVersion.set(a.version_id, (alumnosPorVersion.get(a.version_id) ?? 0) + 1);
  for (const a of (certs.data ?? []) as { version_id: string }[]) certsPorVersion.set(a.version_id, (certsPorVersion.get(a.version_id) ?? 0) + 1);
  const video = new Map(((videos.data ?? []) as { id: string; video_id: string | null }[]).map((v) => [v.id, v.video_id]));
  const correcta = new Map(((correctas.data ?? []) as { id: string; es_correcta: boolean }[]).map((o) => [o.id, o.es_correcta]));
  const vistas = new Map<string, number>(); const completas = new Map<string, number>();
  for (const p of (progreso.data ?? []) as { leccion_id: string; completada_en: string | null }[]) {
    vistas.set(p.leccion_id, (vistas.get(p.leccion_id) ?? 0) + 1);
    if (p.completada_en) completas.set(p.leccion_id, (completas.get(p.leccion_id) ?? 0) + 1);
  }
  const respondidas = new Map<string, number>();
  for (const r of (respuestas.data ?? []) as { pregunta_id: string }[]) respondidas.set(r.pregunta_id, (respondidas.get(r.pregunta_id) ?? 0) + 1);
  const conAcceso = new Set(((accesos.data ?? []) as { perfil_id: string }[]).map((a) => a.perfil_id));
  const conCertificado = new Set(((certs.data ?? []) as { perfil_id: string }[]).map((a) => a.perfil_id));

  const porOrden = <T extends { orden: number }>(a: T, b: T) => a.orden - b.orden;
  return {
    id: c.id, slug: c.slug, titulo: c.titulo, resumen: c.resumen, descripcion: c.descripcion, publico: c.publico ?? [],
    edadDesdeMeses: c.edad_desde_meses, edadHastaMeses: c.edad_hasta_meses, duracionMinutos: c.duracion_minutos,
    objetivos: c.objetivos ?? [], requisitos: c.requisitos, precioCentavos: c.precio_centavos,
    videoPresentacionId: c.video_presentacion_id, estado: c.estado, publicadoEn: c.publicado_en ? new Date(c.publicado_en) : null,
    modulos: [...modulos].sort(porOrden).map((m) => ({
      id: m.id, titulo: m.titulo, orden: m.orden, retirado: m.retirado,
      lecciones: [...m.lecciones].sort(porOrden).map((l) => ({
        id: l.id, titulo: l.titulo, descripcion: l.descripcion, duracionMinutos: l.duracion_minutos, orden: l.orden, retirada: l.retirada,
        videoId: video.get(l.id) ?? null, vistas: vistas.get(l.id) ?? 0, completadas: completas.get(l.id) ?? 0,
        marca: { enVigente: enVigente.lecciones.has(l.id), enAlgunaVersion: enAlguna.lecciones.has(l.id),
          bloqueada: bloqueoLeccion.get(l.id)?.bloqueada ?? false, bloqueoMotivo: bloqueoLeccion.get(l.id)?.bloqueo_motivo ?? null,
          versiones: versionesDeLeccion.get(l.id) ?? [] },
        materiales: [...l.recursos_leccion].sort(porOrden).map((r) => ({
          id: r.id, titulo: r.titulo, ruta: r.ruta_almacenamiento, tamanoBytes: r.tamano_bytes, retirado: r.retirado,
          enVersion: enAlguna.materiales.has(r.id), bloqueado: materialBloqueado.has(r.id),
          complementario: r.complementario, complementoDe: complementoDe.get(r.id) ?? [],
        })),
      })),
    })),
    evaluacion: evalFila ? {
      id: evalFila.id, puntajeMinimo: evalFila.puntaje_minimo, intentosPermitidos: evalFila.intentos_permitidos,
      mensajeAprobado: evalFila.mensaje_aprobado, mensajeDesaprobado: evalFila.mensaje_desaprobado,
      intentos: intentos.count ?? 0,
      preguntas: [...evalFila.preguntas].sort(porOrden).map((p) => ({
        id: p.id, enunciado: p.enunciado, tipo: p.tipo, tema: p.tema, orden: p.orden, retirada: p.retirada,
        respuestas: respondidas.get(p.id) ?? 0,
        versiones: (versionesDePregunta.get(p.id) ?? []).sort((a, b) => a - b),
        marca: { enVigente: enVigente.preguntas.has(p.id), enAlgunaVersion: versionesDePregunta.has(p.id),
          bloqueada: bloqueoPregunta.get(p.id)?.bloqueada ?? false, bloqueoMotivo: bloqueoPregunta.get(p.id)?.bloqueo_motivo ?? null, versiones: [] },
        opciones: [...p.opciones].sort(porOrden).map((o) => ({ id: o.id, texto: o.texto, orden: o.orden, esCorrecta: correcta.get(o.id) ?? false })),
      })),
    } : null,
    historial: {
      alumnos: conAcceso.size,
      alumnosSinCertificado: [...conAcceso].filter((p) => !conCertificado.has(p)).length,
      certificados: conCertificado.size,
      ordenes: items.count ?? 0,
    },
    versiones: filasVersion.map((v) => ({
      id: v.id, numero: v.numero, publicadaEn: new Date(v.publicada_en), resumen: v.resumen, puntajeMinimo: v.puntaje_minimo,
      intentosPermitidos: v.intentos_permitidos, alumnos: alumnosPorVersion.get(v.id) ?? 0, certificados: certsPorVersion.get(v.id) ?? 0,
      lecciones: v.version_lecciones.length, preguntas: v.version_preguntas.length, vigente: v.id === c.version_vigente_id, objetivos: v.objetivos ?? [],
    })),
    quitadoDelBorrador: {
      lecciones: modulos.flatMap((m) => m.lecciones.map((l) => ({ ...l, moduloRetirado: m.retirado })))
        .filter((l) => enVigente.lecciones.has(l.id) && (l.retirada || l.moduloRetirado)).map((l) => ({ id: l.id, titulo: l.titulo })),
      preguntas: (evalFila?.preguntas ?? []).filter((p) => enVigente.preguntas.has(p.id) && p.retirada).map((p) => ({ id: p.id, enunciado: p.enunciado })),
    },
  };
});

/** Diferencias del borrador respecto de la versión vigente: lo que traería una versión nueva. */
export function cambiosDelBorrador(c: CursoAdmin) {
  const vigente = c.versiones.find((v) => v.vigente);
  const lecciones = c.modulos.filter((m) => !m.retirado).flatMap((m) => m.lecciones).filter((l) => !l.retirada && !l.marca.bloqueada);
  const preguntas = (c.evaluacion?.preguntas ?? []).filter((p) => !p.retirada && !p.marca.bloqueada);
  return {
    vigente,
    leccionesNuevas: lecciones.filter((l) => !l.marca.enVigente).map((l) => l.titulo),
    leccionesQuitadas: c.quitadoDelBorrador.lecciones.map((l) => l.titulo),
    preguntasNuevas: preguntas.filter((p) => !p.marca.enVigente).length,
    preguntasQuitadas: c.quitadoDelBorrador.preguntas.length,
    objetivosCambian: Boolean(vigente) && JSON.stringify(vigente!.objetivos) !== JSON.stringify(c.objetivos),
    criterios: vigente && c.evaluacion
      ? { puntaje: [vigente.puntajeMinimo, c.evaluacion.puntajeMinimo] as const, intentos: [vigente.intentosPermitidos, c.evaluacion.intentosPermitidos] as const }
      : null,
  };
}

/** Cifras para la lista de publicación (misma regla que la base). */
export function estadoContenido(c: CursoAdmin) {
  const vigentes = c.modulos.filter((m) => !m.retirado).flatMap((m) => m.lecciones.filter((l) => !l.retirada));
  const preguntas = (c.evaluacion?.preguntas ?? []).filter((p) => !p.retirada);
  return {
    precioCentavos: c.precioCentavos,
    leccionesVigentes: vigentes.length,
    preguntasVigentes: preguntas.length,
    preguntasSinCorrecta: preguntas.filter((p) => !p.opciones.some((o) => o.esCorrecta)).length,
  };
}

export function tieneHistorial(c: CursoAdmin) {
  return c.historial.alumnos > 0 || c.historial.certificados > 0 || c.historial.ordenes > 0;
}
