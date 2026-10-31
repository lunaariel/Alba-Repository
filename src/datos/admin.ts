import 'server-only';
import { clienteSesion } from './supabase';
import { exigirAdmin } from './sesion';
import { GRUPOS_ACTIVIDAD, type FilaActividad, type GrupoActividad } from '@/dominio/auditoria';

/**
 * Lecturas del panel. Cada función vuelve a exigir el rol admin (no alcanza con el layout,
 * que se dibuja en paralelo con la página) y además RLS solo deja leer a la admin.
 */

export interface RegistroActividad extends FilaActividad {
  id: number;
  fecha: Date;
  autor: string;                   // nombre, o "Sistema" para procesos automáticos
}

export const POR_PAGINA = 30;

export async function registroActividad(opciones: { pagina: number; grupo: GrupoActividad | null }) {
  await exigirAdmin();
  const supabase = await clienteSesion();
  const desde = (Math.max(1, opciones.pagina) - 1) * POR_PAGINA;
  let consulta = supabase
    .from('auditoria')
    .select('id, actor_id, accion, entidad, entidad_id, antes, despues, creado_en', { count: 'exact' })
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1);
  if (opciones.grupo) consulta = consulta.in('entidad', [...GRUPOS_ACTIVIDAD[opciones.grupo].entidades]);
  const { data, error, count } = await consulta;
  if (error) throw new Error(`No se pudo leer el registro de actividad: ${error.message}`);

  type Fila = { id: number; actor_id: string | null; accion: string; entidad: string; entidad_id: string | null;
    antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; creado_en: string };
  const filas = (data ?? []) as Fila[];
  const actores = [...new Set(filas.map((f) => f.actor_id).filter((x): x is string => Boolean(x)))];
  const nombres = new Map<string, string>();
  if (actores.length) {
    const { data: perfiles } = await supabase.from('perfiles').select('id, nombre_completo').in('id', actores);
    for (const p of (perfiles ?? []) as { id: string; nombre_completo: string }[]) nombres.set(p.id, p.nombre_completo);
  }
  const registros: RegistroActividad[] = filas.map((f) => ({
    id: f.id, fecha: new Date(f.creado_en), accion: f.accion, entidad: f.entidad, entidadId: f.entidad_id,
    antes: f.antes, despues: f.despues,
    autor: f.actor_id ? (nombres.get(f.actor_id) ?? 'Cuenta eliminada') : 'Sistema',
  }));
  return { registros, total: count ?? registros.length, paginas: Math.max(1, Math.ceil((count ?? 0) / POR_PAGINA)) };
}
