import 'server-only';
import { cache } from 'react';
import { clientePublico } from './supabase';
import { combinarTextos, type Textos } from '@/contenido/textos';
import type { CursoResumen } from '@/dominio/catalogo';

/** Todas las lecturas de este archivo usan el cliente anónimo: RLS solo deja ver lo publicado. */

export interface Configuracion {
  nombre: string;
  correoContacto: string | null;
  whatsapp: string | null;
  zonaHoraria: string;
  textos: Textos;
}

export const configuracion = cache(async (): Promise<Configuracion> => {
  const { data } = await clientePublico()
    .from('configuracion_academia')
    .select('nombre, correo_contacto, whatsapp, zona_horaria, textos')
    .maybeSingle();
  return {
    nombre: data?.nombre ?? 'Albor',
    correoContacto: data?.correo_contacto ?? null,
    whatsapp: data?.whatsapp ?? null,
    zonaHoraria: data?.zona_horaria ?? 'America/Guatemala',
    textos: combinarTextos(data?.textos),
  };
});

const COLUMNAS_CURSO =
  'slug, titulo, resumen, publico, edad_desde_meses, edad_hasta_meses, duracion_minutos, precio_centavos, portada_ruta';

type FilaCurso = {
  slug: string; titulo: string; resumen: string | null; publico: string[];
  edad_desde_meses: number | null; edad_hasta_meses: number | null; duracion_minutos: number | null;
  precio_centavos: number; portada_ruta: string | null;
};

const aResumen = (f: FilaCurso): CursoResumen => ({
  slug: f.slug, titulo: f.titulo, resumen: f.resumen, publico: f.publico ?? [],
  edadDesdeMeses: f.edad_desde_meses, edadHastaMeses: f.edad_hasta_meses,
  duracionMinutos: f.duracion_minutos, precioCentavos: f.precio_centavos, portadaRuta: f.portada_ruta,
});

export const cursosPublicados = cache(async (): Promise<CursoResumen[]> => {
  const { data, error } = await clientePublico()
    .from('cursos').select(COLUMNAS_CURSO).eq('estado', 'publicado').order('publicado_en', { ascending: true });
  if (error) throw new Error(`No se pudieron leer los cursos: ${error.message}`);
  return (data as FilaCurso[]).map(aResumen);
});

export interface CursoDetalle extends CursoResumen {
  id: string;
  descripcion: string | null;
  objetivos: string[];
  requisitos: string | null;
  videoPresentacionId: string | null;
  modulos: { titulo: string; lecciones: { titulo: string; duracionMinutos: number | null }[] }[];
  cantidadMateriales: number;
  tieneEvaluacion: boolean;
}

export const cursoPorSlug = cache(async (slug: string): Promise<CursoDetalle | null> => {
  const db = clientePublico();
  const { data: c } = await db
    .from('cursos')
    .select(`id, descripcion, objetivos, requisitos, video_presentacion_id, version_vigente_id, ${COLUMNAS_CURSO}`)
    .eq('slug', slug).eq('estado', 'publicado').maybeSingle();
  if (!c) return null;

  // Temario de la versión vigente publicada (nunca el borrador) y conteos públicos.
  const [{ data: resumen }, { data: temario }, { data: version }] = await Promise.all([
    db.rpc('resumen_publico_curso', { p_curso: c.id }),
    c.version_vigente_id ? db.rpc('temario_version', { p_version: c.version_vigente_id }) : Promise.resolve({ data: [] }),
    c.version_vigente_id
      ? db.from('versiones_curso').select('objetivos, requisitos').eq('id', c.version_vigente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // Objetivos y requisitos de la versión vigente (lo que compra quien se inscribe hoy), no del borrador.
  const programa = (version as { objetivos: string[]; requisitos: string | null } | null) ?? { objetivos: c.objetivos ?? [], requisitos: c.requisitos };
  const r = (resumen ?? {}) as { materiales?: number; evaluacion?: boolean };

  type FilaTemario = { modulo_id: string; modulo_titulo: string; modulo_orden: number; leccion_titulo: string; duracion_minutos: number | null; orden: number };
  const filas = [...((temario ?? []) as FilaTemario[])].sort((a, b) => a.modulo_orden - b.modulo_orden || a.orden - b.orden);
  const modulos: CursoDetalle['modulos'] = [];
  const porModulo = new Map<string, CursoDetalle['modulos'][number]>();
  for (const f of filas) {
    let m = porModulo.get(f.modulo_id);
    if (!m) { m = { titulo: f.modulo_titulo, lecciones: [] }; porModulo.set(f.modulo_id, m); modulos.push(m); }
    m.lecciones.push({ titulo: f.leccion_titulo, duracionMinutos: f.duracion_minutos });
  }

  return {
    ...aResumen(c as unknown as FilaCurso),
    id: c.id, descripcion: c.descripcion, objetivos: programa.objetivos ?? [], requisitos: programa.requisitos,
    videoPresentacionId: c.video_presentacion_id, modulos,
    cantidadMateriales: r.materiales ?? 0, tieneEvaluacion: r.evaluacion ?? false,
  };
});

export interface TallerPublico {
  id: string; slug: string; titulo: string; descripcion: string | null;
  iniciaEn: Date; terminaEn: Date; zonaHoraria: string;
  cupo: number | null; ocupados: number; precioCentavos: number; estado: string;
}

type FilaTaller = {
  id: string; slug: string; titulo: string; descripcion: string | null; inicia_en: string; termina_en: string;
  zona_horaria: string; cupo: number | null; precio_centavos: number; estado: string;
};

async function conOcupados(filas: FilaTaller[]): Promise<TallerPublico[]> {
  const db = clientePublico();
  return Promise.all(filas.map(async (t) => {
    const { data } = await db.rpc('lugares_ocupados', { p_taller: t.id });
    return {
      id: t.id, slug: t.slug, titulo: t.titulo, descripcion: t.descripcion,
      iniciaEn: new Date(t.inicia_en), terminaEn: new Date(t.termina_en), zonaHoraria: t.zona_horaria,
      cupo: t.cupo, ocupados: typeof data === 'number' ? data : 0, precioCentavos: t.precio_centavos, estado: t.estado,
    };
  }));
}

const COLUMNAS_TALLER = 'id, slug, titulo, descripcion, inicia_en, termina_en, zona_horaria, cupo, precio_centavos, estado';

export const proximosTalleres = cache(async (limite = 6): Promise<TallerPublico[]> => {
  const { data } = await clientePublico()
    .from('talleres').select(COLUMNAS_TALLER)
    .in('estado', ['publicado', 'cancelado']).gte('termina_en', new Date().toISOString())
    .order('inicia_en', { ascending: true }).limit(limite);
  return conOcupados((data ?? []) as FilaTaller[]);
});

export const tallerPorSlug = cache(async (slug: string): Promise<TallerPublico | null> => {
  const { data } = await clientePublico().from('talleres').select(COLUMNAS_TALLER).eq('slug', slug).maybeSingle();
  if (!data) return null;
  const [t] = await conOcupados([data as FilaTaller]);
  return t ?? null;
});

export interface ArticuloPublico { slug: string; titulo: string; resumen: string | null; cuerpo: string; publicadoEn: Date; categoria: string | null }

export const articulosPublicados = cache(async (): Promise<ArticuloPublico[]> => {
  const { data } = await clientePublico()
    .from('articulos').select('slug, titulo, resumen, cuerpo_markdown, publicado_en, categoria')
    .eq('estado', 'publicado').order('publicado_en', { ascending: false });
  type FilaArticulo = { slug: string; titulo: string; resumen: string | null; cuerpo_markdown: string; publicado_en: string | null; categoria: string | null };
  return ((data ?? []) as FilaArticulo[]).map((a) => ({
    slug: a.slug, titulo: a.titulo, resumen: a.resumen, cuerpo: a.cuerpo_markdown,
    publicadoEn: new Date(a.publicado_en ?? Date.now()), categoria: a.categoria,
  }));
});

/** ¿Mostrar "Recursos" en el menú? Solo si hay al menos un artículo publicado. */
export const hayRecursos = cache(async () => (await articulosPublicados()).length > 0);
