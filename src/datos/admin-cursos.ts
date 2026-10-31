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

export interface MaterialAdmin { id: string; titulo: string; ruta: string; tamanoBytes: number }
export interface LeccionAdmin {
  id: string; titulo: string; descripcion: string | null; duracionMinutos: number | null; orden: number;
  retirada: boolean; videoId: string | null; materiales: MaterialAdmin[]; vistas: number; completadas: number;
}
export interface ModuloAdmin { id: string; titulo: string; orden: number; retirado: boolean; lecciones: LeccionAdmin[] }
export interface OpcionAdmin { id: string; texto: string; orden: number; esCorrecta: boolean }
export interface PreguntaAdmin {
  id: string; enunciado: string; tipo: 'unica' | 'multiple'; tema: string | null; orden: number; retirada: boolean;
  opciones: OpcionAdmin[]; respuestas: number;
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
}

/** Todo el curso, con lo retirado y con lo que el editor necesita para avisar del impacto. */
export const cursoAdmin = cache(async (id: string): Promise<CursoAdmin | null> => {
  await exigirAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const s = await clienteSesion();
  const { data: c } = await s.from('cursos')
    .select(`id, slug, titulo, resumen, descripcion, publico, edad_desde_meses, edad_hasta_meses, duracion_minutos, objetivos,
             requisitos, precio_centavos, video_presentacion_id, estado, publicado_en,
             modulos(id, titulo, orden, retirado, lecciones(id, titulo, descripcion, duracion_minutos, orden, retirada,
               recursos_leccion(id, titulo, ruta_almacenamiento, tamano_bytes, orden))),
             evaluaciones(id, puntaje_minimo, intentos_permitidos, mensaje_aprobado, mensaje_desaprobado,
               preguntas(id, enunciado, tipo, tema, orden, retirada, opciones(id, texto, orden)))`)
    .eq('id', id).maybeSingle();
  if (!c) return null;

  type L = { id: string; titulo: string; descripcion: string | null; duracion_minutos: number | null; orden: number; retirada: boolean;
    recursos_leccion: { id: string; titulo: string; ruta_almacenamiento: string; tamano_bytes: number; orden: number }[] };
  type M = { id: string; titulo: string; orden: number; retirado: boolean; lecciones: L[] };
  type P = { id: string; enunciado: string; tipo: 'unica' | 'multiple'; tema: string | null; orden: number; retirada: boolean;
    opciones: { id: string; texto: string; orden: number }[] };
  type E = { id: string; puntaje_minimo: number; intentos_permitidos: number | null; mensaje_aprobado: string; mensaje_desaprobado: string; preguntas: P[] };
  const modulos = (c.modulos ?? []) as M[];
  const evalFila = (Array.isArray(c.evaluaciones) ? c.evaluaciones[0] : c.evaluaciones) as E | null | undefined;
  const leccionIds = modulos.flatMap((m) => m.lecciones.map((l) => l.id));
  const preguntaIds = (evalFila?.preguntas ?? []).map((p) => p.id);
  const servicio = clienteServicio();

  const [videos, correctas, progreso, respuestas, accesos, certs, items, intentos] = await Promise.all([
    leccionIds.length ? servicio.from('lecciones').select('id, video_id').in('id', leccionIds) : Promise.resolve({ data: [] }),
    preguntaIds.length ? servicio.from('opciones').select('id, es_correcta').in('pregunta_id', preguntaIds) : Promise.resolve({ data: [] }),
    leccionIds.length ? s.from('progreso_leccion').select('leccion_id, completada_en').in('leccion_id', leccionIds) : Promise.resolve({ data: [] }),
    preguntaIds.length ? s.from('respuestas_intento').select('pregunta_id').in('pregunta_id', preguntaIds) : Promise.resolve({ data: [] }),
    s.from('accesos_curso').select('perfil_id').eq('curso_id', id).eq('estado', 'activo'),
    s.from('certificados').select('perfil_id').eq('curso_id', id),
    s.from('items_orden').select('id', { count: 'exact', head: true }).eq('curso_id', id),
    evalFila ? s.from('intentos_evaluacion').select('id', { count: 'exact', head: true }).eq('evaluacion_id', evalFila.id) : Promise.resolve({ count: 0 }),
  ]);
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
        materiales: [...l.recursos_leccion].sort(porOrden).map((r) => ({ id: r.id, titulo: r.titulo, ruta: r.ruta_almacenamiento, tamanoBytes: r.tamano_bytes })),
      })),
    })),
    evaluacion: evalFila ? {
      id: evalFila.id, puntajeMinimo: evalFila.puntaje_minimo, intentosPermitidos: evalFila.intentos_permitidos,
      mensajeAprobado: evalFila.mensaje_aprobado, mensajeDesaprobado: evalFila.mensaje_desaprobado,
      intentos: intentos.count ?? 0,
      preguntas: [...evalFila.preguntas].sort(porOrden).map((p) => ({
        id: p.id, enunciado: p.enunciado, tipo: p.tipo, tema: p.tema, orden: p.orden, retirada: p.retirada,
        respuestas: respondidas.get(p.id) ?? 0,
        opciones: [...p.opciones].sort(porOrden).map((o) => ({ id: o.id, texto: o.texto, orden: o.orden, esCorrecta: correcta.get(o.id) ?? false })),
      })),
    } : null,
    historial: {
      alumnos: conAcceso.size,
      alumnosSinCertificado: [...conAcceso].filter((p) => !conCertificado.has(p)).length,
      certificados: conCertificado.size,
      ordenes: items.count ?? 0,
    },
  };
});

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
