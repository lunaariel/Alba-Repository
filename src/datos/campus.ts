import 'server-only';
import { cache } from 'react';
import { clienteSesion, clienteServicio } from './supabase';
import { exigirSesion } from './sesion';
import { ordenarLecciones, porcentajeAvance, leccionParaContinuar } from '@/dominio/aprendizaje';
import { proveedorVideo } from '@/servicios/video';
import { aFinalizacion, type Finalizacion } from '@/dominio/evaluacion';

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
  /** Fin del acceso (calculado por el servidor al comprar). null: sin vencimiento (accesos anteriores o concesiones). */
  venceEn: Date | null;
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

type FilaAcceso = { curso_id: string; version_id: string; vence_en: string | null; cursos: { id: string; slug: string; titulo: string; resumen: string | null } | null };
const vigente = (a: { vence_en: string | null }) => !a.vence_en || new Date(a.vence_en).getTime() > Date.now();

/** Cursos con acceso vigente, con su avance según la versión de cada uno. Los vencidos van aparte (misCursosVencidos). */
export const misCursos = cache(async (): Promise<CursoCampus[]> => {
  await exigirSesion('/campus');
  const supabase = await clienteSesion();
  const { data: accesos, error } = await supabase
    .from('accesos_curso').select('curso_id, version_id, vence_en, cursos(id, slug, titulo, resumen)').eq('estado', 'activo').order('creado_en');
  if (error) throw new Error(`No se pudieron leer sus cursos: ${error.message}`);
  // La base protege el contenido al vencer (tiene_acceso, version_de); aquí solo se ordena la vista.
  const filas = (accesos as unknown as FilaAcceso[]).filter((a) => a.cursos && vigente(a));
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
  return filas.map(({ cursos: c, version_id, vence_en }) => {
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
      venceEn: vence_en ? new Date(vence_en) : null,
    };
  });
});

export interface CursoVencido {
  id: string; titulo: string; venceEn: Date;
  certificados: { id: string; codigo: string }[];
}

/** Cursos cuyo acceso venció: sin contenido, pero con sus certificados (siguen siendo válidos). */
export const misCursosVencidos = cache(async (): Promise<CursoVencido[]> => {
  await exigirSesion('/campus');
  const supabase = await clienteSesion();
  const { data } = await supabase.from('accesos_curso').select('curso_id, version_id, vence_en, cursos(id, slug, titulo, resumen)').eq('estado', 'activo');
  const filas = ((data ?? []) as unknown as FilaAcceso[]).filter((a) => a.cursos && !vigente(a));
  if (!filas.length) return [];
  const { data: certs } = await supabase.from('certificados').select('id, curso_id, codigo_verificacion').in('curso_id', filas.map((f) => f.curso_id));
  return filas.map((f) => ({
    id: f.curso_id, titulo: f.cursos!.titulo, venceEn: new Date(f.vence_en!),
    certificados: ((certs ?? []) as { id: string; curso_id: string; codigo_verificacion: string }[])
      .filter((c) => c.curso_id === f.curso_id).map((c) => ({ id: c.id, codigo: c.codigo_verificacion })),
  }));
});

export interface MaterialCampus { id: string; titulo: string; leccionId: string; tamanoBytes: number; complementario: boolean }

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
  /** Modalidad y requisitos de la versión del alumno, y cuánto cumplió (la base decide). */
  finalizacion: Finalizacion | null;
  /** Actividades formativas de su versión (solo en la modalidad formativa con preguntas). */
  actividades: { evaluacionId: string; preguntas: number; envios: number } | null;
}

/** Un curso del campus por slug, solo si la persona tiene acceso activo. Si no, null. */
export const cursoCampus = cache(async (slug: string): Promise<CursoCampusDetalle | null> => {
  const curso = (await misCursos()).find((c) => c.slug === slug);
  if (!curso) return null;
  const supabase = await clienteSesion();
  const ids = curso.lecciones.map((l) => l.id);
  const [{ data: materiales }, { data: ev }, { data: fin }] = await Promise.all([
    ids.length
      ? supabase.from('recursos_leccion').select('id, titulo, leccion_id, tamano_bytes, orden, complementario').in('leccion_id', ids).order('orden')
      : Promise.resolve({ data: [] }),
    // Criterios e intentos de la versión del alumno, no del borrador.
    supabase.rpc('mi_evaluacion', { p_curso: curso.id }),
    supabase.rpc('mi_finalizacion', { p_curso: curso.id }),
  ]);
  type Ev = { evaluacion_id: string | null; puntaje_minimo: number; intentos_permitidos: number | null; preguntas: number;
    modalidad?: 'sumativa' | 'formativa'; envios_formativos?: number;
    aprobado_equivalente: boolean; intentos: { numero: number; puntaje: number; aprobado: boolean; revisado: boolean; entregado_en: string }[] };
  const e = ev as Ev | null;
  const formativa = e?.modalidad === 'formativa';
  const resumen: EvaluacionResumen | null = !formativa && e?.evaluacion_id && e.preguntas > 0 ? {
    id: e.evaluacion_id, puntajeMinimo: e.puntaje_minimo, intentosPermitidos: e.intentos_permitidos, preguntas: e.preguntas,
    aprobada: e.aprobado_equivalente,
    intentos: (e.intentos ?? []).map((i) => ({ numero: i.numero, puntaje: i.puntaje, aprobado: i.aprobado, revisado: i.revisado, entregadoEn: new Date(i.entregado_en) })),
  } : null;
  return {
    ...curso,
    materiales: ((materiales ?? []) as { id: string; titulo: string; leccion_id: string; tamano_bytes: number; complementario: boolean }[])
      .map((m) => ({ id: m.id, titulo: m.titulo, leccionId: m.leccion_id, tamanoBytes: m.tamano_bytes, complementario: m.complementario })),
    evaluacion: resumen,
    pendientes: curso.lecciones.filter((l) => !l.completada).length,
    finalizacion: aFinalizacion(fin as Record<string, unknown> | null),
    actividades: formativa && e?.evaluacion_id && e.preguntas > 0
      ? { evaluacionId: e.evaluacion_id, preguntas: e.preguntas, envios: e.envios_formativos ?? 0 } : null,
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
  id: string;
  slug: string;
  titulo: string;
  iniciaEn: Date;
  terminaEn: Date;
  zonaHoraria: string;
  estado: string;
  /** Estado de la inscripción: confirmada, cancelada, reembolso_pendiente, reembolsada. */
  inscripcion: string;
  origen: 'compra' | 'gratuita' | 'cortesia';
  /** Paga: tiene orden asociada. No hay cancelación ordinaria desde el campus. */
  paga: boolean;
  canceladaPor: 'alumno' | 'academia' | null;
  /** Respuesta a la última reprogramación (null si no hubo). */
  respuesta: 'pendiente' | 'aceptada' | 'reembolso_solicitado' | 'no_asiste' | null;
  /** El servidor solo lo entrega a inscriptos confirmados (enlace_taller). */
  enlace: string | null;
  reprogramadoDesde: Date | null;
  motivoCancelacion: string | null;
  grabacion: { estado: string; acceso: boolean; venceEn: Date | null } | null;
}

export interface AvisoCampus { id: string; tipo: string; tallerId: string | null; detalle: Record<string, unknown>; creadoEn: Date }

type FilaInscripcion = {
  estado: string; origen: TallerInscripto['origen']; creado_en: string; item_orden_id: string | null;
  cancelada_por: TallerInscripto['canceladaPor']; respuesta_reprogramacion: TallerInscripto['respuesta'];
  talleres: {
    id: string; slug: string; titulo: string; inicia_en: string; termina_en: string; zona_horaria: string; estado: string;
    motivo_cancelacion: string | null;
  } | null;
};

export async function misTalleres(): Promise<TallerInscripto[]> {
  await exigirSesion('/campus/talleres');
  const supabase = await clienteSesion();
  const [{ data, error }, { data: avisos }, { data: grabaciones }] = await Promise.all([
    supabase.from('inscripciones_taller')
      .select('estado, origen, creado_en, item_orden_id, cancelada_por, respuesta_reprogramacion, talleres(id, slug, titulo, inicia_en, termina_en, zona_horaria, estado, motivo_cancelacion)')
      .in('estado', ['confirmada', 'reembolso_pendiente', 'reembolsada', 'cancelada'])
      .order('creado_en', { ascending: false }),
    supabase.from('notificaciones').select('taller_id, detalle, creado_en').eq('tipo', 'taller_reprogramado').order('creado_en', { ascending: false }),
    supabase.rpc('mis_grabaciones'),
  ]);
  if (error) throw new Error(`No se pudieron leer sus talleres: ${error.message}`);
  // Una fila por taller: la inscripción más reciente (alguien puede cancelar y volver a inscribirse).
  const vistos = new Set<string>();
  const filas = ((data ?? []) as unknown as FilaInscripcion[]).filter((f) => f.talleres && !vistos.has(f.talleres.id) && vistos.add(f.talleres.id));
  const reprogramado = new Map<string, Date>();
  for (const a of (avisos ?? []) as { taller_id: string; detalle: { inicia_antes?: string } }[]) {
    if (!reprogramado.has(a.taller_id) && a.detalle?.inicia_antes) reprogramado.set(a.taller_id, new Date(a.detalle.inicia_antes));
  }
  const grab = new Map(((grabaciones ?? []) as { taller_id: string; estado: string; acceso: boolean; vence_en: string | null }[])
    .map((g) => [g.taller_id, { estado: g.estado, acceso: g.acceso, venceEn: g.vence_en ? new Date(g.vence_en) : null }]));
  const enlaces = await Promise.all(filas.map(async (f) =>
    f.estado === 'confirmada' ? ((await supabase.rpc('enlace_taller', { p_taller: f.talleres!.id })).data as string | null) : null));
  return filas.map((f, i) => {
    const t = f.talleres!;
    return {
      id: t.id, slug: t.slug, titulo: t.titulo, iniciaEn: new Date(t.inicia_en), terminaEn: new Date(t.termina_en), zonaHoraria: t.zona_horaria,
      estado: t.estado, inscripcion: f.estado, origen: f.origen, paga: f.origen === 'compra' || f.item_orden_id !== null,
      canceladaPor: f.cancelada_por, respuesta: f.respuesta_reprogramacion, enlace: enlaces[i] ?? null,
      reprogramadoDesde: reprogramado.get(t.id) ?? null, motivoCancelacion: t.motivo_cancelacion, grabacion: grab.get(t.id) ?? null,
    };
  }).sort((a, b) => a.iniciaEn.getTime() - b.iniciaEn.getTime());
}

/** Avisos del campus sin leer. No hay proveedor de correo: estos avisos son el único canal por ahora. */
export async function misAvisos(): Promise<AvisoCampus[]> {
  await exigirSesion('/campus/talleres');
  const { data } = await (await clienteSesion()).from('notificaciones')
    .select('id, tipo, taller_id, detalle, creado_en')
    .is('leida_en', null).neq('estado', 'descartada')
    .in('tipo', ['taller_reprogramado', 'reprogramacion_pendiente', 'taller_cancelado', 'grabacion_disponible', 'recordatorio_taller'])
    .order('creado_en', { ascending: false }).limit(20);
  return ((data ?? []) as { id: string; tipo: string; taller_id: string | null; detalle: Record<string, unknown> | null; creado_en: string }[])
    .map((n) => ({ id: n.id, tipo: n.tipo, tallerId: n.taller_id, detalle: n.detalle ?? {}, creadoEn: new Date(n.creado_en) }));
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
  /** Modalidad y requisitos antes y después (null si la base no los informa). */
  requisitos: { antes: RequisitosVersion; despues: RequisitosVersion } | null;
}
export interface RequisitosVersion { modalidad: 'sumativa' | 'formativa'; requiereActividades: boolean; requiereValidacion: boolean; conCertificado: boolean }

/** Qué cambiaría si el alumno pasa a la versión vigente del curso. null si ya está en ella. */
export async function cambioDeVersion(cursoId: string): Promise<CambioVersion | null> {
  const { data } = await (await clienteSesion()).rpc('vista_cambio_version', { p_curso: cursoId });
  if (!data) return null;
  const d = data as {
    actual: { id: string; numero: number; publicada_en: string }; nueva: { id: string; numero: number; publicada_en: string; resumen: string | null };
    lecciones_nuevas: string[]; lecciones_quitadas: string[]; pendientes_despues: number; completadas_conservadas: number;
    puntaje_minimo: { antes: number; despues: number }; intentos_permitidos: { antes: number | null; despues: number | null };
    requisitos?: { antes: FilaRequisitos; despues: FilaRequisitos };
    evaluacion_igual: boolean; tiene_certificado: boolean;
  };
  return {
    actual: { id: d.actual.id, numero: d.actual.numero, publicadaEn: new Date(d.actual.publicada_en) },
    nueva: { id: d.nueva.id, numero: d.nueva.numero, publicadaEn: new Date(d.nueva.publicada_en), resumen: d.nueva.resumen },
    leccionesNuevas: d.lecciones_nuevas ?? [], leccionesQuitadas: d.lecciones_quitadas ?? [],
    pendientesDespues: d.pendientes_despues, completadasConservadas: d.completadas_conservadas,
    puntajeMinimo: d.puntaje_minimo, intentosPermitidos: d.intentos_permitidos,
    evaluacionIgual: d.evaluacion_igual, tieneCertificado: d.tiene_certificado,
    requisitos: d.requisitos ? { antes: aRequisitos(d.requisitos.antes), despues: aRequisitos(d.requisitos.despues) } : null,
  };
}

type FilaRequisitos = { modalidad: 'sumativa' | 'formativa'; requiere_actividades: boolean; requiere_validacion: boolean; con_certificado: boolean };
const aRequisitos = (r: FilaRequisitos): RequisitosVersion => ({
  modalidad: r.modalidad, requiereActividades: r.requiere_actividades, requiereValidacion: r.requiere_validacion, conCertificado: r.con_certificado,
});
