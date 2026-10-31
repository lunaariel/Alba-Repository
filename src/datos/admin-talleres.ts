import 'server-only';
import { cache } from 'react';
import { clienteServicio, clienteSesion } from './supabase';
import { exigirAdmin } from './sesion';

/**
 * Lecturas del panel de talleres. Con la sesión de la admin (RLS), salvo lo que ningún cliente lee
 * (enlaces de la reunión y correos de las personas), que se lee con la clave de servicio después de
 * exigirAdmin().
 */

export type EstadoTaller = 'borrador' | 'publicado' | 'cancelado' | 'finalizado' | 'archivado';

export interface TallerListado {
  id: string; slug: string; titulo: string; estado: EstadoTaller; iniciaEn: Date; terminaEn: Date; zonaHoraria: string;
  cupo: number | null; precioCentavos: number; confirmadas: number; reservas: number; sinEnlace: boolean; reembolsosPendientes: number;
}

type FilaTaller = {
  id: string; slug: string; titulo: string; estado: EstadoTaller; inicia_en: string; termina_en: string; zona_horaria: string;
  cupo: number | null; precio_centavos: number;
};

export async function listaTalleres(): Promise<TallerListado[]> {
  await exigirAdmin();
  const s = await clienteSesion();
  const [{ data: talleres, error }, { data: inscripciones }, { data: reservas }, { data: reuniones }] = await Promise.all([
    s.from('talleres').select('id, slug, titulo, estado, inicia_en, termina_en, zona_horaria, cupo, precio_centavos').order('inicia_en', { ascending: true }),
    s.from('inscripciones_taller').select('taller_id, estado'),
    s.from('reservas_cupo').select('taller_id, vence_en').is('liberada_en', null),
    s.from('reuniones').select('taller_id, estado'),
  ]);
  if (error) throw new Error(`No se pudieron leer los talleres: ${error.message}`);
  const ahora = Date.now();
  const contar = (filas: { taller_id: string }[], f: (x: never) => boolean = () => true) => {
    const m = new Map<string, number>();
    for (const x of filas) if (f(x as never)) m.set(x.taller_id, (m.get(x.taller_id) ?? 0) + 1);
    return m;
  };
  const ins = (inscripciones ?? []) as { taller_id: string; estado: string }[];
  const confirmadas = contar(ins, (x: { estado: string }) => x.estado === 'confirmada');
  const reembolsos = contar(ins, (x: { estado: string }) => x.estado === 'reembolso_pendiente');
  const vigentes = contar((reservas ?? []) as { taller_id: string; vence_en: string }[], (x: { vence_en: string }) => new Date(x.vence_en).getTime() > ahora);
  const conEnlace = new Set(((reuniones ?? []) as { taller_id: string; estado: string }[]).filter((r) => r.estado === 'activa').map((r) => r.taller_id));
  return ((talleres ?? []) as FilaTaller[]).map((t) => ({
    id: t.id, slug: t.slug, titulo: t.titulo, estado: t.estado, iniciaEn: new Date(t.inicia_en), terminaEn: new Date(t.termina_en),
    zonaHoraria: t.zona_horaria, cupo: t.cupo, precioCentavos: t.precio_centavos,
    confirmadas: confirmadas.get(t.id) ?? 0, reservas: vigentes.get(t.id) ?? 0, sinEnlace: !conEnlace.has(t.id),
    reembolsosPendientes: reembolsos.get(t.id) ?? 0,
  }));
}

export interface InscripcionAdmin {
  id: string; perfilId: string; nombre: string; correo: string | null; estado: string; origen: 'compra' | 'gratuita' | 'cortesia';
  asistio: boolean | null; motivo: string | null; creadoEn: Date; ordenEstado: string | null;
}
export interface TallerAdmin extends TallerListado {
  descripcion: string | null; plataforma: 'zoom' | 'meet'; enlaceVisibleHoras: number; duplicadoDe: { id: string; titulo: string } | null;
  motivoCancelacion: string | null; canceladoEn: Date | null;
  reunion: { proveedor: string; enlaceParticipante: string; enlaceAnfitrion: string | null; estado: string; ultimoError: string | null } | null;
  recordatorios: number[];
  inscripciones: InscripcionAdmin[];
  reprogramaciones: { iniciaAntes: Date; iniciaDespues: Date; inscriptos: number; motivo: string; creadoEn: Date }[];
  notificaciones: { pendientes: number; descartadas: number; enviadas: number };
  tieneHistorial: boolean;
}

export const tallerAdmin = cache(async (id: string): Promise<TallerAdmin | null> => {
  await exigirAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const s = await clienteSesion();
  const { data: t } = await s.from('talleres')
    .select('id, slug, titulo, descripcion, estado, inicia_en, termina_en, zona_horaria, cupo, precio_centavos, plataforma, enlace_visible_horas, duplicado_de, motivo_cancelacion, cancelado_en')
    .eq('id', id).maybeSingle();
  if (!t) return null;
  const servicio = clienteServicio();
  const [reunion, recordatorios, inscripciones, reservas, reprogramaciones, notificaciones, origen, ordenes] = await Promise.all([
    servicio.from('reuniones').select('proveedor, enlace_participante, enlace_anfitrion, estado, ultimo_error').eq('taller_id', id).maybeSingle(),
    s.from('recordatorios').select('minutos_antes').eq('taller_id', id).order('minutos_antes', { ascending: false }),
    s.from('inscripciones_taller').select('id, perfil_id, estado, origen, asistio, motivo, creado_en, item_orden_id, perfiles(nombre_completo)').eq('taller_id', id).order('creado_en'),
    s.from('reservas_cupo').select('vence_en').eq('taller_id', id).is('liberada_en', null),
    s.from('reprogramaciones_taller').select('inicia_antes, inicia_despues, inscriptos, motivo, creado_en').eq('taller_id', id).order('creado_en', { ascending: false }),
    s.from('notificaciones').select('estado').eq('taller_id', id),
    t.duplicado_de ? s.from('talleres').select('id, titulo').eq('id', t.duplicado_de).maybeSingle() : Promise.resolve({ data: null }),
    s.from('items_orden').select('id, ordenes(estado)').eq('taller_id', id),
  ]);
  type FI = { id: string; perfil_id: string; estado: string; origen: InscripcionAdmin['origen']; asistio: boolean | null; motivo: string | null; creado_en: string;
    item_orden_id: string | null; perfiles: { nombre_completo: string } | { nombre_completo: string }[] | null };
  const filas = (inscripciones.data ?? []) as FI[];
  // Correos: solo por el servidor (auth.users no es legible por clientes).
  const correos = new Map<string, string>();
  await Promise.all([...new Set(filas.map((f) => f.perfil_id))].map(async (pid) => {
    const { data } = await servicio.auth.admin.getUserById(pid);
    if (data.user?.email) correos.set(pid, data.user.email);
  }));
  const estadoOrden = new Map(((ordenes.data ?? []) as { id: string; ordenes: { estado: string } | { estado: string }[] | null }[])
    .map((x) => [x.id, (Array.isArray(x.ordenes) ? x.ordenes[0] : x.ordenes)?.estado ?? null]));
  const ahora = Date.now();
  const r = reunion.data as { proveedor: string; enlace_participante: string; enlace_anfitrion: string | null; estado: string; ultimo_error: string | null } | null;
  const noti = (notificaciones.data ?? []) as { estado: string }[];
  const confirmadas = filas.filter((f) => f.estado === 'confirmada').length;
  return {
    id: t.id, slug: t.slug, titulo: t.titulo, descripcion: t.descripcion, estado: t.estado as EstadoTaller,
    iniciaEn: new Date(t.inicia_en), terminaEn: new Date(t.termina_en), zonaHoraria: t.zona_horaria, cupo: t.cupo, precioCentavos: t.precio_centavos,
    plataforma: t.plataforma, enlaceVisibleHoras: t.enlace_visible_horas, motivoCancelacion: t.motivo_cancelacion,
    canceladoEn: t.cancelado_en ? new Date(t.cancelado_en) : null,
    duplicadoDe: (origen.data as { id: string; titulo: string } | null) ?? null,
    confirmadas, reservas: ((reservas.data ?? []) as { vence_en: string }[]).filter((x) => new Date(x.vence_en).getTime() > ahora).length,
    sinEnlace: !r || r.estado !== 'activa',
    reembolsosPendientes: filas.filter((f) => f.estado === 'reembolso_pendiente').length,
    reunion: r ? { proveedor: r.proveedor, enlaceParticipante: r.enlace_participante, enlaceAnfitrion: r.enlace_anfitrion, estado: r.estado, ultimoError: r.ultimo_error } : null,
    recordatorios: ((recordatorios.data ?? []) as { minutos_antes: number }[]).map((x) => x.minutos_antes),
    inscripciones: filas.map((f) => {
      const p = Array.isArray(f.perfiles) ? f.perfiles[0] : f.perfiles;
      return {
        id: f.id, perfilId: f.perfil_id, nombre: p?.nombre_completo ?? 'Sin nombre', correo: correos.get(f.perfil_id) ?? null, estado: f.estado,
        origen: f.origen, asistio: f.asistio, motivo: f.motivo, creadoEn: new Date(f.creado_en),
        ordenEstado: f.item_orden_id ? estadoOrden.get(f.item_orden_id) ?? null : null,
      };
    }),
    reprogramaciones: ((reprogramaciones.data ?? []) as { inicia_antes: string; inicia_despues: string; inscriptos: number; motivo: string; creado_en: string }[])
      .map((x) => ({ iniciaAntes: new Date(x.inicia_antes), iniciaDespues: new Date(x.inicia_despues), inscriptos: x.inscriptos, motivo: x.motivo, creadoEn: new Date(x.creado_en) })),
    notificaciones: {
      pendientes: noti.filter((n) => n.estado === 'pendiente').length,
      descartadas: noti.filter((n) => n.estado === 'descartada').length,
      enviadas: noti.filter((n) => n.estado === 'enviada').length,
    },
    tieneHistorial: filas.length > 0 || ((ordenes.data ?? []) as unknown[]).length > 0,
  };
});

export interface IncidenciaAdmin {
  id: string; tipo: 'pago_sin_cupo' | 'reembolso_por_cancelacion'; estado: string; creadoEn: Date; nota: string | null;
  taller: { id: string; titulo: string } | null; persona: string | null; correo: string | null; orden: { id: string; estado: string; total: number } | null;
  detalle: Record<string, unknown>;
}

export async function listaIncidencias(): Promise<IncidenciaAdmin[]> {
  await exigirAdmin();
  const s = await clienteSesion();
  const { data } = await s.from('incidencias')
    .select('id, tipo, estado, creado_en, nota, detalle, perfil_id, talleres(id, titulo), perfiles(nombre_completo), ordenes(id, estado, total_centavos)')
    .order('creado_en', { ascending: false }).limit(200);
  type F = { id: string; tipo: IncidenciaAdmin['tipo']; estado: string; creado_en: string; nota: string | null; detalle: Record<string, unknown>; perfil_id: string | null;
    talleres: { id: string; titulo: string } | null; perfiles: { nombre_completo: string } | null; ordenes: { id: string; estado: string; total_centavos: number } | null };
  const filas = (data ?? []) as unknown as F[];
  const servicio = clienteServicio();
  const correos = new Map<string, string>();
  await Promise.all([...new Set(filas.map((f) => f.perfil_id).filter((x): x is string => Boolean(x)))].map(async (pid) => {
    const { data: u } = await servicio.auth.admin.getUserById(pid);
    if (u.user?.email) correos.set(pid, u.user.email);
  }));
  return filas.map((f) => ({
    id: f.id, tipo: f.tipo, estado: f.estado, creadoEn: new Date(f.creado_en), nota: f.nota, detalle: f.detalle ?? {},
    taller: f.talleres, persona: f.perfiles?.nombre_completo ?? null, correo: f.perfil_id ? correos.get(f.perfil_id) ?? null : null,
    orden: f.ordenes ? { id: f.ordenes.id, estado: f.ordenes.estado, total: f.ordenes.total_centavos } : null,
  }));
}

export async function notificacionesPendientes(): Promise<number> {
  await exigirAdmin();
  const { count } = await (await clienteSesion()).from('notificaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
  return count ?? 0;
}
