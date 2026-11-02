import 'server-only';
import { exigirAdmin } from './sesion';
import { clienteSesion } from './supabase';

/**
 * Consultas de solo lectura del panel: alumnos con el estado de sus accesos, ventas (órdenes) y certificados.
 * Cada una verifica el rol primero; la base lo vuelve a exigir (panel_alumnos y RLS con es_admin()).
 */

export type EstadoAcceso = 'vigente' | 'vence_pronto' | 'vencido' | 'programado' | 'sin_vencimiento';
export type FiltroAlumnos = 'todos' | 'vigentes' | 'vencen_pronto' | 'vencidos' | 'programados';
export interface AlumnoPanel {
  id: string; nombre: string; correo: string; creadoEn: Date;
  cursos: { curso: string; cursoId: string; estado: EstadoAcceso; fin: Date | null; proximoInicio: Date | null }[];
}

export async function alumnosPanel(busqueda: string, filtro: FiltroAlumnos): Promise<AlumnoPanel[]> {
  await exigirAdmin();
  const { data, error } = await (await clienteSesion()).rpc('panel_alumnos', { p_busqueda: busqueda || null, p_filtro: filtro });
  if (error) throw new Error('No se pudo leer la lista de alumnos.');
  return ((data ?? []) as { perfil_id: string; nombre: string; correo: string; creado_en: string; cursos: { curso: string; curso_id: string; estado: EstadoAcceso; fin: string | null; proximo_inicio: string | null }[] }[])
    .map((a) => ({
      id: a.perfil_id, nombre: a.nombre, correo: a.correo, creadoEn: new Date(a.creado_en),
      cursos: a.cursos.map((c) => ({ curso: c.curso, cursoId: c.curso_id, estado: c.estado, fin: c.fin ? new Date(c.fin) : null, proximoInicio: c.proximo_inicio ? new Date(c.proximo_inicio) : null })),
    }));
}

export const ESTADOS_ORDEN = ['pendiente', 'aprobada', 'rechazada', 'cancelada', 'vencida', 'reembolsada', 'contracargo', 'requiere_reembolso'] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];
export interface VentaPanel {
  id: string; fecha: Date; persona: string; estado: EstadoOrden; totalCentavos: number; items: string[]; pagos: { estado: string; proveedor: string }[];
}

export async function ventasPanel(estado: EstadoOrden | null): Promise<VentaPanel[]> {
  await exigirAdmin();
  let q = (await clienteSesion()).from('ordenes')
    .select('id, creado_en, aprobada_en, estado, total_centavos, perfiles(nombre_completo), items_orden(descripcion), pagos(estado, proveedor)')
    .order('creado_en', { ascending: false }).limit(200);
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error) throw new Error('No se pudieron leer las ventas.');
  return ((data ?? []) as unknown as { id: string; creado_en: string; aprobada_en: string | null; estado: EstadoOrden; total_centavos: number;
    perfiles: { nombre_completo: string } | null; items_orden: { descripcion: string }[]; pagos: { estado: string; proveedor: string }[] }[])
    .map((o) => ({ id: o.id, fecha: new Date(o.aprobada_en ?? o.creado_en), persona: o.perfiles?.nombre_completo ?? '(cuenta eliminada)', estado: o.estado,
      totalCentavos: o.total_centavos, items: o.items_orden.map((i) => i.descripcion), pagos: o.pagos }));
}

export interface CertificadoPanel {
  id: string; codigo: string; nombre: string; curso: string; emitidoEn: Date; version: number | null; modalidad: string | null;
}

export async function certificadosPanel(busqueda: string): Promise<CertificadoPanel[]> {
  await exigirAdmin();
  let q = (await clienteSesion()).from('certificados')
    .select('id, codigo_verificacion, nombre_en_certificado, titulo_curso, emitido_en, modalidad, versiones_curso(numero)')
    .order('emitido_en', { ascending: false }).limit(200);
  const b = busqueda.trim();
  // Búsqueda por código exacto, nombre o curso (los comodines del usuario se escapan).
  if (b) {
    const seguro = b.replace(/[%_,()*\\]/g, ' ').trim();
    q = q.or(`codigo_verificacion.eq.${seguro.toUpperCase()},nombre_en_certificado.ilike.*${seguro}*,titulo_curso.ilike.*${seguro}*`);
  }
  const { data, error } = await q;
  if (error) throw new Error('No se pudieron leer los certificados.');
  return ((data ?? []) as unknown as { id: string; codigo_verificacion: string; nombre_en_certificado: string; titulo_curso: string; emitido_en: string;
    modalidad: string | null; versiones_curso: { numero: number } | null }[])
    .map((c) => ({ id: c.id, codigo: c.codigo_verificacion, nombre: c.nombre_en_certificado, curso: c.titulo_curso, emitidoEn: new Date(c.emitido_en),
      version: c.versiones_curso?.numero ?? null, modalidad: c.modalidad }));
}
