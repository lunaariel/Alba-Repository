import 'server-only';
import { cache } from 'react';
import { clienteSesion, clienteServicio } from './supabase';
import { exigirSesion } from './sesion';
import { ordenarLecciones, porcentajeAvance, leccionParaContinuar } from '@/dominio/aprendizaje';
import { proveedorVideo } from '@/servicios/video';

/**
 * Lecturas del campus. Todo pasa por el cliente con sesión, así que RLS decide qué ve cada alumno.
 * El cliente de servicio solo se usa para leer el id del video privado, después de comprobar el acceso.
 */

export interface LeccionCampus {
  id: string;
  titulo: string;
  orden: number;
  moduloOrden: number;
  moduloTitulo: string;
  duracionMinutos: number | null;
  completada: boolean;
  ultimaVisita: Date | null;
}

export interface CursoCampus {
  id: string;
  slug: string;
  titulo: string;
  resumen: string | null;
  lecciones: LeccionCampus[];
  avance: number;
  continuar: LeccionCampus | null;
  certificado: { id: string; codigo: string } | null;
  certificadoAnterior: { id: string; codigo: string } | null;
  version: { id: string; numero: number; publicadaEn: Date } | null;
}

type FilaTemario = { modulo_id: string; modulo_titulo: string; modulo_orden: number; leccion_id: string; leccion_titulo: string; duracion_minutos: number | null; orden: number };
type FilaProgreso = { leccion_id: string; completada_en: string | null; ultima_visita_en: string };

/** Lecciones de la versión de cada curso del alumno (versionado académico), con su avance. */
async function leccionesConProgreso(versiones: { cursoId: string; versionId: string }[]): Promise<Map<string, LeccionCampus[]>> {
  const supabase = await clienteSesion();
  const [temarios, { data: progreso, error: e2 }] = await Promise.all([
    Promise.all(versiones.map((v) => supabase.rpc('temario_version', { p_version: v.versionId }))),
    supabase.from('progreso_leccion').select('leccion_id, completada_en, ultima_visita_en'),
  ]);
  const e1 = temarios.find((t) => t.error)?.error;
  if (e1 || e2) throw new Error(`No se pudo leer el avance: ${(e1 ?? e2)?.message}`);
  const porLeccion = new Map((progreso as FilaProgreso[]).map((p) => [p.leccion_id, p]));
  const resultado = new Map<string, LeccionCampus[]>();
  versiones.forEach((v, i) => {
    const filas = (temarios[i]?.data ?? []) as FilaTemario[];
    resultado.set(v.cursoId, ordenarLecciones(filas.map((f) => {
      const p = porLeccion.get(f.leccion_id);
      return {
        id: f.leccion_id, titulo: f.leccion_titulo, orden: f.orden, moduloOrden: f.modulo_orden, moduloTitulo: f.modulo_titulo,
        duracionMinutos: f.duracion_minutos, completada: Boolean(p?.completada_en),
        ultimaVisita: p ? new Date(p.ultima_visita_en) : null,
      };
    })));
  });
  return resultado;
}

type FilaAcceso = { curso_id: string; version_id: string; cursos: { id: string; slug: string; titulo: string; resumen: string | null } | null };

/** Cursos con acceso activo, con su avance según la versión de cada uno. El acceso no vence. */
export const misCursos = cache(async (): Promise<CursoCampus[]> => {
  await exigirSesion('/campus');
  const supabase = await clienteSesion();
  const { data: accesos, error } = await supabase
    .from('accesos_curso').select('curso_id, version_id, cursos(id, slug, titulo, resumen)').eq('estado', 'activo').order('creado_en');
  if (error) throw new Error(`No se pudieron leer sus cursos: ${error.message}`);
  const filas = (accesos as unknown as FilaAcceso[]).filter((a) => a.cursos);
  if (filas.length === 0) return [];
  const ids = filas.map((a) => a.curso_id);
  const [lecciones, { data: certs }, { data: versiones }] = await Promise.all([
    leccionesConProgreso(filas.map((f) => ({ cursoId: f.curso_id, versionId: f.version_id }))),
    supabase.from('certificados').select('id, curso_id, version_id, codigo_verificacion, emitido_en').in('curso_id', ids).order('emitido_en', { ascending: false }),
    supabase.from('versiones_curso').select('id, numero, publicada_en').in('id', filas.map((f) => f.version_id)),
  ]);
  type Cert = { id: string; curso_id: string; version_id: string; codigo_verificacion: string };
  const listaCerts = (certs ?? []) as Cert[];
  const versionPorId = new Map(((versiones ?? []) as { id: string; numero: number; publicada_en: string }[]).map((v) => [v.id, v]));
  return filas.map(({ cursos: c, version_id }) => {
    const ls = lecciones.get(c!.id) ?? [];
    // El certificado de la versión actual; si no hay, el último obtenido (de una versión anterior).
    const cert = listaCerts.find((x) => x.curso_id === c!.id && x.version_id === version_id) ?? null;
    const anterior = listaCerts.find((x) => x.curso_id === c!.id && x.version_id !== version_id) ?? null;
    const v = versionPorId.get(version_id);
    return {
      id: c!.id, slug: c!.slug, titulo: c!.titulo, resumen: c!.resumen, lecciones: ls,
      avance: porcentajeAvance(ls), continuar: leccionParaContinuar(ls),
      certificado: cert ? { id: cert.id, codigo: cert.codigo_verificacion } : null,
      certificadoAnterior: anterior ? { id: anterior.id, codigo: anterior.codigo_verificacion } : null,
      version: v ? { id: version_id, numero: v.numero, publicadaEn: new Date(v.publicada_en) } : null,
    };
  });
});

export interface MaterialCampus { id: string; titulo: string; leccionId: string; tamanoBytes: number }

export interface EvaluacionResumen {
  id: string;
  puntajeMinimo: number;
  intentosPermitidos: number | null;
  preguntas: number;
  intentos: { numero: number; puntaje: number; aprobado: boolean; revisado: boolean; entregadoEn: Date }[];
  /** Aprobó esta evaluación (en su versión o en otra con la misma evaluación). */
  aprobada: boolean;
}

export interface CursoCampusDetalle extends CursoCampus {
  materiales: MaterialCampus[];
  evaluacion: EvaluacionResumen | null;
  pendientes: number;
}

/** Un curso del campus por slug, solo si la persona tiene acceso activo. Si no, null. */
export const cursoCampus = cache(async (slug: string): Promise<CursoCampusDetalle | null> => {
  const curso = (await misCursos()).find((c) => c.slug === slug);
  if (!curso) return null;
  const supabase = await clienteSesion();
  const ids = curso.lecciones.map((l) => l.id);
  const [{ data: materiales }, { data: ev }] = await Promise.all([
    ids.length
      ? supabase.from('recursos_leccion').select('id, titulo, leccion_id, tamano_bytes, orden').in('leccion_id', ids).order('orden')
      : Promise.resolve({ data: [] }),
    // Criterios e intentos de la versión del alumno, no del borrador.
    supabase.rpc('mi_evaluacion', { p_curso: curso.id }),
  ]);
  type Ev = { evaluacion_id: string | null; puntaje_minimo: number; intentos_permitidos: number | null; preguntas: number;
    aprobado_equivalente: boolean; intentos: { numero: number; puntaje: number; aprobado: boolean; revisado: boolean; entregado_en: string }[] };
  const e = ev as Ev | null;
  const resumen: EvaluacionResumen | null = e?.evaluacion_id && e.preguntas > 0 ? {
    id: e.evaluacion_id, puntajeMinimo: e.puntaje_minimo, intentosPermitidos: e.intentos_permitidos, preguntas: e.preguntas,
    aprobada: e.aprobado_equivalente,
    intentos: (e.intentos ?? []).map((i) => ({ numero: i.numero, puntaje: i.puntaje, aprobado: i.aprobado, revisado: i.revisado, entregadoEn: new Date(i.entregado_en) })),
  } : null;
  return {
    ...curso,
    materiales: ((materiales ?? []) as { id: string; titulo: string; leccion_id: string; tamano_bytes: number }[])
      .map((m) => ({ id: m.id, titulo: m.titulo, leccionId: m.leccion_id, tamanoBytes: m.tamano_bytes })),
    evaluacion: resumen,
    pendientes: curso.lecciones.filter((l) => !l.completada).length,
  };
});

export interface LeccionDetalle {
  leccion: LeccionCampus;
  descripcion: string | null;
  urlVideo: string | null;          // null: video pendiente (sin id o sin proveedor configurado)
}

/** Detalle de una lección y su URL de video firmada (vence en 2 horas). */
export async function leccionCampus(curso: CursoCampusDetalle, leccionId: string): Promise<LeccionDetalle | null> {
  const leccion = curso.lecciones.find((l) => l.id === leccionId);
  if (!leccion) return null;
  const supabase = await clienteSesion();
  const { data } = await supabase.from('lecciones').select('descripcion').eq('id', leccionId).maybeSingle();
  // El acceso ya se comprobó (la lección está en un curso de misCursos). Recién ahora se lee el id privado.
  const { data: privado } = await clienteServicio().from('lecciones').select('video_id').eq('id', leccionId).maybeSingle();
  const proveedor = proveedorVideo();
  const urlVideo = privado?.video_id && proveedor.nombre !== 'simulado'
    ? await proveedor.urlReproduccion(privado.video_id, { segundosValidez: 2 * 60 * 60 })
    : null;
  return { leccion, descripcion: data?.descripcion ?? null, urlVideo };
}

export interface PreguntaEvaluacion {
  id: string;
  enunciado: string;
  tipo: 'unica' | 'multiple';
  opciones: { id: string; texto: string }[];
}

/** Preguntas de la versión del alumno, en su orden, sin la respuesta correcta (no legible por clientes). */
export async function preguntasEvaluacion(evaluacionId: string, cursoId: string): Promise<PreguntaEvaluacion[]> {
  const supabase = await clienteSesion();
  const [{ data, error }, { data: orden }] = await Promise.all([
    supabase.from('preguntas').select('id, enunciado, tipo, opciones(id, texto, orden)').eq('evaluacion_id', evaluacionId),
    supabase.rpc('orden_preguntas_mi_version', { p_curso: cursoId }),
  ]);
  if (error) throw new Error(`No se pudo leer la evaluación: ${error.message}`);
  const posicion = new Map(((orden ?? []) as { pregunta_id: string; orden: number }[]).map((o) => [o.pregunta_id, o.orden]));
  return ((data ?? []) as { id: string; enunciado: string; tipo: 'unica' | 'multiple'; opciones: { id: string; texto: string; orden: number }[] }[])
    .filter((p) => posicion.has(p.id))
    .sort((a, b) => posicion.get(a.id)! - posicion.get(b.id)!)
    .map((p) => ({
      id: p.id, enunciado: p.enunciado, tipo: p.tipo,
      opciones: [...(p.opciones ?? [])].sort((a, b) => a.orden - b.orden).map((o) => ({ id: o.id, texto: o.texto })),
    }));
}

export interface TallerInscripto {
  slug: string;
  titulo: string;
  iniciaEn: Date;
  terminaEn: Date;
  zonaHoraria: string;
  estado: string;
  enlace: string | null;
}

type FilaInscripcion = {
  talleres: {
    slug: string; titulo: string; inicia_en: string; termina_en: string; zona_horaria: string; estado: string;
    reuniones: { enlace_participante: string; estado: string }[] | { enlace_participante: string; estado: string } | null;
  } | null;
};

export async function misTalleres(): Promise<TallerInscripto[]> {
  await exigirSesion('/campus/talleres');
  const supabase = await clienteSesion();
  const { data, error } = await supabase
    .from('inscripciones_taller')
    .select('talleres(slug, titulo, inicia_en, termina_en, zona_horaria, estado, reuniones(enlace_participante, estado))')
    .eq('estado', 'confirmada');
  if (error) throw new Error(`No se pudieron leer sus talleres: ${error.message}`);
  return ((data ?? []) as unknown as FilaInscripcion[])
    .filter((f) => f.talleres)
    .map(({ talleres: t }) => {
      const r = Array.isArray(t!.reuniones) ? t!.reuniones[0] : t!.reuniones;
      return {
        slug: t!.slug, titulo: t!.titulo, iniciaEn: new Date(t!.inicia_en), terminaEn: new Date(t!.termina_en),
        zonaHoraria: t!.zona_horaria, estado: t!.estado,
        enlace: r && r.estado === 'activa' && t!.estado === 'publicado' ? r.enlace_participante : null,
      };
    })
    .sort((a, b) => a.iniciaEn.getTime() - b.iniciaEn.getTime());
}

export interface Compra {
  id: string;
  fecha: Date;
  estado: string;
  totalCentavos: number;
  items: { descripcion: string; precioCentavos: number }[];
  recibo: { numero: string | null; estado: string } | null;
  factura: { serie: string | null; numero: string | null; estado: string } | null;
}

type FilaOrden = {
  id: string; creado_en: string; aprobada_en: string | null; estado: string; total_centavos: number;
  items_orden: { descripcion: string; precio_centavos: number }[];
  documentos_fiscales: { tipo: string; estado: string; serie: string | null; numero: string | null }[];
};

const ESTADOS_VISIBLES = ['aprobada', 'reembolsada', 'contracargo'];

export async function misCompras(): Promise<Compra[]> {
  await exigirSesion('/campus/compras');
  const supabase = await clienteSesion();
  const { data, error } = await supabase
    .from('ordenes')
    .select('id, creado_en, aprobada_en, estado, total_centavos, items_orden(descripcion, precio_centavos), documentos_fiscales(tipo, estado, serie, numero)')
    .in('estado', ESTADOS_VISIBLES)
    .order('creado_en', { ascending: false });
  if (error) throw new Error(`No se pudieron leer sus compras: ${error.message}`);
  return ((data ?? []) as FilaOrden[]).map((o) => {
    const recibo = o.documentos_fiscales.find((d) => d.tipo === 'recibo');
    const factura = o.documentos_fiscales.find((d) => d.tipo === 'factura_fel');
    return {
      id: o.id, fecha: new Date(o.aprobada_en ?? o.creado_en), estado: o.estado, totalCentavos: o.total_centavos,
      items: o.items_orden.map((i) => ({ descripcion: i.descripcion, precioCentavos: i.precio_centavos })),
      recibo: recibo ? { numero: recibo.numero, estado: recibo.estado } : null,
      factura: factura ? { serie: factura.serie, numero: factura.numero, estado: factura.estado } : null,
    };
  });
}

export async function compra(id: string): Promise<Compra | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await misCompras()).find((c) => c.id === id) ?? null;
}

export interface Perfil { nombre: string; correo: string; zonaHoraria: string }

export const miPerfil = cache(async (): Promise<Perfil> => {
  const usuario = await exigirSesion('/campus/cuenta');
  const supabase = await clienteSesion();
  const { data } = await supabase.from('perfiles').select('nombre_completo, zona_horaria').eq('id', usuario.id).maybeSingle();
  return { nombre: data?.nombre_completo ?? '', correo: usuario.email ?? '', zonaHoraria: data?.zona_horaria ?? 'America/Guatemala' };
});

/** Visita a una lección (para "Continuar donde lo dejó"). No toca completada_en; RLS exige acceso. */
export async function registrarVisita(perfilId: string, leccionId: string) {
  const supabase = await clienteSesion();
  await supabase.from('progreso_leccion')
    .upsert({ perfil_id: perfilId, leccion_id: leccionId, ultima_visita_en: new Date().toISOString() }, { onConflict: 'perfil_id,leccion_id' });
}

export interface CambioVersion {
  actual: { id: string; numero: number; publicadaEn: Date };
  nueva: { id: string; numero: number; publicadaEn: Date; resumen: string | null };
  leccionesNuevas: string[];
  leccionesQuitadas: string[];
  pendientesDespues: number;
  completadasConservadas: number;
  puntajeMinimo: { antes: number; despues: number };
  intentosPermitidos: { antes: number | null; despues: number | null };
  evaluacionIgual: boolean;
  tieneCertificado: boolean;
}

/** Qué cambiaría si el alumno pasa a la versión vigente del curso. null si ya está en ella. */
export async function cambioDeVersion(cursoId: string): Promise<CambioVersion | null> {
  const { data } = await (await clienteSesion()).rpc('vista_cambio_version', { p_curso: cursoId });
  if (!data) return null;
  const d = data as {
    actual: { id: string; numero: number; publicada_en: string }; nueva: { id: string; numero: number; publicada_en: string; resumen: string | null };
    lecciones_nuevas: string[]; lecciones_quitadas: string[]; pendientes_despues: number; completadas_conservadas: number;
    puntaje_minimo: { antes: number; despues: number }; intentos_permitidos: { antes: number | null; despues: number | null };
    evaluacion_igual: boolean; tiene_certificado: boolean;
  };
  return {
    actual: { id: d.actual.id, numero: d.actual.numero, publicadaEn: new Date(d.actual.publicada_en) },
    nueva: { id: d.nueva.id, numero: d.nueva.numero, publicadaEn: new Date(d.nueva.publicada_en), resumen: d.nueva.resumen },
    leccionesNuevas: d.lecciones_nuevas ?? [], leccionesQuitadas: d.lecciones_quitadas ?? [],
    pendientesDespues: d.pendientes_despues, completadasConservadas: d.completadas_conservadas,
    puntajeMinimo: d.puntaje_minimo, intentosPermitidos: d.intentos_permitidos,
    evaluacionIgual: d.evaluacion_igual, tieneCertificado: d.tiene_certificado,
  };
}
