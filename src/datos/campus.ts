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
}

type FilaModulo = {
  curso_id: string; titulo: string; orden: number;
  lecciones: { id: string; titulo: string; orden: number; duracion_minutos: number | null }[];
};
type FilaProgreso = { leccion_id: string; completada_en: string | null; ultima_visita_en: string };

async function leccionesConProgreso(cursoIds: string[]): Promise<Map<string, LeccionCampus[]>> {
  const supabase = await clienteSesion();
  const [{ data: modulos, error: e1 }, { data: progreso, error: e2 }] = await Promise.all([
    supabase.from('modulos').select('curso_id, titulo, orden, lecciones(id, titulo, orden, duracion_minutos)').in('curso_id', cursoIds),
    supabase.from('progreso_leccion').select('leccion_id, completada_en, ultima_visita_en'),
  ]);
  if (e1 || e2) throw new Error(`No se pudo leer el avance: ${(e1 ?? e2)?.message}`);
  const porLeccion = new Map((progreso as FilaProgreso[]).map((p) => [p.leccion_id, p]));
  const resultado = new Map<string, LeccionCampus[]>();
  for (const m of modulos as FilaModulo[]) {
    const lista = resultado.get(m.curso_id) ?? [];
    for (const l of m.lecciones ?? []) {
      const p = porLeccion.get(l.id);
      lista.push({
        id: l.id, titulo: l.titulo, orden: l.orden, moduloOrden: m.orden, moduloTitulo: m.titulo,
        duracionMinutos: l.duracion_minutos, completada: Boolean(p?.completada_en),
        ultimaVisita: p ? new Date(p.ultima_visita_en) : null,
      });
    }
    resultado.set(m.curso_id, lista);
  }
  for (const [k, v] of resultado) resultado.set(k, ordenarLecciones(v));
  return resultado;
}

type FilaAcceso = { curso_id: string; cursos: { id: string; slug: string; titulo: string; resumen: string | null } | null };

/** Cursos con acceso activo, con su avance. El acceso no vence. */
export const misCursos = cache(async (): Promise<CursoCampus[]> => {
  await exigirSesion('/campus');
  const supabase = await clienteSesion();
  const { data: accesos, error } = await supabase
    .from('accesos_curso').select('curso_id, cursos(id, slug, titulo, resumen)').eq('estado', 'activo').order('creado_en');
  if (error) throw new Error(`No se pudieron leer sus cursos: ${error.message}`);
  const filas = (accesos as unknown as FilaAcceso[]).filter((a) => a.cursos);
  if (filas.length === 0) return [];
  const ids = filas.map((a) => a.curso_id);
  const [lecciones, { data: certs }] = await Promise.all([
    leccionesConProgreso(ids),
    supabase.from('certificados').select('id, curso_id, codigo_verificacion').in('curso_id', ids),
  ]);
  const certPorCurso = new Map(((certs ?? []) as { id: string; curso_id: string; codigo_verificacion: string }[])
    .map((c) => [c.curso_id, { id: c.id, codigo: c.codigo_verificacion }]));
  return filas.map(({ cursos: c }) => {
    const ls = lecciones.get(c!.id) ?? [];
    return {
      id: c!.id, slug: c!.slug, titulo: c!.titulo, resumen: c!.resumen, lecciones: ls,
      avance: porcentajeAvance(ls), continuar: leccionParaContinuar(ls), certificado: certPorCurso.get(c!.id) ?? null,
    };
  });
});

export interface MaterialCampus { id: string; titulo: string; leccionId: string; tamanoBytes: number }

export interface EvaluacionResumen {
  id: string;
  puntajeMinimo: number;
  intentosPermitidos: number | null;
  intentos: { numero: number; puntaje: number; aprobado: boolean; entregadoEn: Date }[];
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
  const [{ data: materiales }, { data: evaluacion }] = await Promise.all([
    ids.length
      ? supabase.from('recursos_leccion').select('id, titulo, leccion_id, tamano_bytes, orden').in('leccion_id', ids).order('orden')
      : Promise.resolve({ data: [] }),
    supabase.from('evaluaciones').select('id, puntaje_minimo, intentos_permitidos').eq('curso_id', curso.id).maybeSingle(),
  ]);
  let resumen: EvaluacionResumen | null = null;
  if (evaluacion) {
    const { data: intentos } = await supabase
      .from('intentos_evaluacion').select('numero, puntaje, aprobado, entregado_en')
      .eq('evaluacion_id', evaluacion.id).order('numero');
    resumen = {
      id: evaluacion.id, puntajeMinimo: evaluacion.puntaje_minimo, intentosPermitidos: evaluacion.intentos_permitidos,
      intentos: ((intentos ?? []) as { numero: number; puntaje: number; aprobado: boolean; entregado_en: string }[])
        .map((i) => ({ numero: i.numero, puntaje: i.puntaje, aprobado: i.aprobado, entregadoEn: new Date(i.entregado_en) })),
    };
  }
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

/** Preguntas sin la respuesta correcta (esa columna no es legible por clientes). */
export async function preguntasEvaluacion(evaluacionId: string): Promise<PreguntaEvaluacion[]> {
  const supabase = await clienteSesion();
  const { data, error } = await supabase
    .from('preguntas').select('id, enunciado, tipo, orden, opciones(id, texto, orden)')
    .eq('evaluacion_id', evaluacionId).order('orden');
  if (error) throw new Error(`No se pudo leer la evaluación: ${error.message}`);
  return ((data ?? []) as { id: string; enunciado: string; tipo: 'unica' | 'multiple'; opciones: { id: string; texto: string; orden: number }[] }[])
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
