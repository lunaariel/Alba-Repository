'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAdminAccion } from '@/datos/sesion';
import { clienteSesion } from '@/datos/supabase';
import { precioACentavos, slugDesde, SLUG_VALIDO, UUID } from '@/dominio/cursos-admin';
import { instanteEnZona, ZONAS_TALLER } from '@/dominio/talleres';
import { codigoErrorTaller } from '@/dominio/talleres-admin';

/**
 * Acciones del panel de talleres. Todas empiezan con exigirAdminAccion() y escriben con la sesión de la
 * admin; las reglas (cupo, fechas, transiciones, motivo) las vuelve a exigir la base y todo queda
 * registrado en la actividad.
 */

export type EstadoForm = { error?: string; ok?: string; campo?: string } | undefined;

const uuid = z.string().regex(UUID);
const texto = (max: number) => z.string().trim().max(max);
const ZONAS = ZONAS_TALLER.map((z) => z.valor) as [string, ...string[]];

function ir(ruta: string, aviso: { error?: string; ok?: string }): never {
  const q = new URLSearchParams();
  if (aviso.error) q.set('error', aviso.error);
  if (aviso.ok) q.set('ok', aviso.ok);
  redirect(`${ruta}?${q}`);
}
function refrescar(id?: string) {
  revalidatePath('/admin/talleres', 'layout');
  if (id) revalidatePath(`/admin/talleres/${id}`, 'layout');
  revalidatePath('/talleres', 'layout');
  revalidatePath('/campus/talleres');
}
const base = (id: string) => `/admin/talleres/${id}`;
const limpio = (v: unknown) => String(v ?? '').replace(/[^0-9a-f-]/gi, '').slice(0, 36);

/** Fecha, hora y duración escritas en la zona del taller → inicio y fin absolutos. */
function horario(datos: FormData): { inicio: Date; fin: Date } | { error: string; campo: string } {
  const zona = String(datos.get('zona') ?? '');
  const inicio = instanteEnZona(String(datos.get('fecha') ?? ''), String(datos.get('hora') ?? ''), zona);
  if (!inicio) return { error: 'Revise la fecha y la hora (esa hora no existe en la zona elegida o el formato no es válido).', campo: 'fecha' };
  const minutos = Number(String(datos.get('duracion') ?? ''));
  if (!Number.isInteger(minutos) || minutos < 15 || minutos > 720) return { error: 'La duración va en minutos, entre 15 y 720.', campo: 'duracion' };
  return { inicio, fin: new Date(inicio.getTime() + minutos * 60000) };
}

export async function crearTaller(_: EstadoForm, datos: FormData): Promise<EstadoForm> {
  await exigirAdminAccion();
  const titulo = texto(140).min(3, 'Escriba un título de al menos 3 letras.').safeParse(datos.get('titulo'));
  if (!titulo.success) return { error: titulo.error.issues[0]?.message, campo: 'titulo' };
  const zona = z.enum(ZONAS).safeParse(datos.get('zona') || 'America/Guatemala');
  if (!zona.success) return { error: 'Elija una zona horaria de la lista.', campo: 'zona' };
  const h = horario(datos);
  if ('error' in h) return h;
  const s = await clienteSesion();
  const raiz = slugDesde(titulo.data) || 'taller';
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? raiz : `${raiz.slice(0, 56)}-${i + 1}`;
    const { data, error } = await s.from('talleres').insert({
      slug, titulo: titulo.data, inicia_en: h.inicio.toISOString(), termina_en: h.fin.toISOString(), zona_horaria: zona.data, precio_centavos: 0,
    }).select('id').single();
    if (!error && data) { refrescar(); redirect(`${base(data.id)}?ok=creado`); }
    if (!error?.message.includes('duplicate key')) return { error: mensaje(error?.message) };
  }
  return { error: 'Ya existe un taller con esa dirección web.' };
}

/** Datos y horario. Con inscriptos, la fecha solo cambia con «Reprogramar» (la base lo exige). */
export async function guardarTaller(_: EstadoForm, datos: FormData): Promise<EstadoForm> {
  await exigirAdminAccion();
  const r = z.object({
    id: uuid,
    titulo: texto(140).min(3, 'Escriba un título de al menos 3 letras.'),
    slug: z.string().trim().regex(SLUG_VALIDO, 'La dirección web usa minúsculas, números y guiones.').max(60),
    descripcion: texto(8000),
    zona: z.enum(ZONAS, { errorMap: () => ({ message: 'Elija una zona horaria de la lista.' }) }),
    tipo: z.enum(['gratuito', 'pago'], { errorMap: () => ({ message: 'Indique si es gratuito o pago.' }) }),
    cupoTipo: z.enum(['limitado', 'ilimitado']),
    plataforma: z.enum(['zoom', 'meet']),
    cancelacion: z.coerce.number({ invalid_type_error: 'El plazo de cancelación va de 0 a 336 horas (14 días).' }).int('Escriba un número entero de horas.')
      .min(0, 'El plazo de cancelación va de 0 a 336 horas (14 días).').max(336, 'El plazo de cancelación va de 0 a 336 horas (14 días).'),
  }).safeParse({
    id: datos.get('id'), titulo: datos.get('titulo'), slug: datos.get('slug'), descripcion: datos.get('descripcion') ?? '',
    zona: datos.get('zona'), tipo: datos.get('tipo'), cupoTipo: datos.get('cupoTipo'), plataforma: datos.get('plataforma'),
    cancelacion: datos.get('cancelacion') ?? '24',
  });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const d = r.data;
  let precio = 0;
  if (d.tipo === 'pago') {
    const p = precioACentavos(String(datos.get('precio') ?? ''));
    if (p === null || p <= 0) return { error: 'Un taller pago necesita un precio en USD mayor que cero, por ejemplo 15 o 15.50.', campo: 'precio' };
    precio = p;
  }
  let cupo: number | null = null;
  if (d.cupoTipo === 'limitado') {
    const c = Number(String(datos.get('cupo') ?? ''));
    if (!Number.isInteger(c) || c < 1 || c > 1000) return { error: 'El cupo es un número entero entre 1 y 1000.', campo: 'cupo' };
    cupo = c;
  }
  const cambios: Record<string, unknown> = {
    titulo: d.titulo, slug: d.slug, descripcion: d.descripcion || null, zona_horaria: d.zona, precio_centavos: precio, cupo,
    plataforma: d.plataforma, cancelacion_horas: d.cancelacion,
  };
  if (datos.get('conFecha') === 'si') {
    const h = horario(datos);
    if ('error' in h) return h;
    cambios.inicia_en = h.inicio.toISOString();
    cambios.termina_en = h.fin.toISOString();
  }
  const { error } = await (await clienteSesion()).from('talleres').update(cambios).eq('id', d.id);
  if (error) return { error: mensaje(error.message), campo: campoDeError(error.message) };
  refrescar(d.id);
  return { ok: 'Cambios guardados.' };
}

export async function cambiarEstadoTaller(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, estado: z.enum(['publicado', 'archivado', 'borrador']) }).safeParse({ id: datos.get('id'), estado: datos.get('estado') });
  if (!r.success) redirect('/admin/talleres');
  const ruta = `${base(r.data.id)}/estado`;
  const palabras = { publicado: null, archivado: 'ARCHIVAR', borrador: null } as const;
  const palabra = palabras[r.data.estado];
  if (palabra && String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== palabra) ir(ruta, { error: 'confirmacion' });
  const { error } = await (await clienteSesion()).from('talleres').update({ estado: r.data.estado }).eq('id', r.data.id);
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(r.data.id);
  ir(ruta, { ok: r.data.estado });
}

/** Solo un taller sin inscriptos, reservas ni órdenes (la base lo impide en otro caso). */
export async function eliminarTaller(datos: FormData) {
  await exigirAdminAccion();
  const id = uuid.safeParse(datos.get('id'));
  if (!id.success) redirect('/admin/talleres');
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'ELIMINAR') ir(`${base(id.data)}/estado`, { error: 'confirmacion' });
  const { error } = await (await clienteSesion()).from('talleres').delete().eq('id', id.data);
  if (error) ir(`${base(id.data)}/estado`, { error: codigoErrorTaller(error.message) });
  refrescar();
  ir('/admin/talleres', { ok: 'eliminado' });
}

export async function duplicarTaller(datos: FormData) {
  await exigirAdminAccion();
  const id = uuid.safeParse(datos.get('id'));
  if (!id.success) redirect('/admin/talleres');
  const ruta = `${base(id.data)}/estado`;
  const h = horario(datos);
  if ('error' in h) ir(ruta, { error: 'fecha_invalida' });
  const { data, error } = await (await clienteSesion()).rpc('duplicar_taller', { p_taller: id.data, p_inicio: h.inicio.toISOString(), p_fin: h.fin.toISOString() });
  if (error || !data) ir(ruta, { error: codigoErrorTaller(error?.message) });
  refrescar();
  ir(base(data as string), { ok: 'duplicado' });
}

export async function reprogramarTaller(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, motivo: texto(500) }).safeParse({ id: datos.get('id'), motivo: datos.get('motivo') ?? '' });
  if (!r.success) redirect('/admin/talleres');
  const ruta = `${base(r.data.id)}/estado`;
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'REPROGRAMAR') ir(ruta, { error: 'confirmacion' });
  const h = horario(datos);
  if ('error' in h) ir(ruta, { error: 'fecha_invalida' });
  const { error } = await (await clienteSesion()).rpc('reprogramar_taller', {
    p_taller: r.data.id, p_inicio: h.inicio.toISOString(), p_fin: h.fin.toISOString(), p_motivo: r.data.motivo,
  });
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(r.data.id);
  ir(ruta, { ok: 'reprogramado' });
}

export async function cancelarTaller(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, motivo: texto(500) }).safeParse({ id: datos.get('id'), motivo: datos.get('motivo') ?? '' });
  if (!r.success) redirect('/admin/talleres');
  const ruta = `${base(r.data.id)}/estado`;
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'CANCELAR') ir(ruta, { error: 'confirmacion' });
  const { error } = await (await clienteSesion()).rpc('cancelar_taller', { p_taller: r.data.id, p_motivo: r.data.motivo });
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(r.data.id);
  ir(ruta, { ok: 'cancelado' });
}

/** Enlace cargado a mano (la creación automática en Zoom o Meet llega en la Fase 6). */
export async function guardarReunion(datos: FormData) {
  await exigirAdminAccion();
  const url = z.string().trim().url().max(500).refine((v) => v.startsWith('https://'), 'https');
  const r = z.object({ id: uuid, participante: url, anfitrion: z.union([url, z.literal('')]) })
    .safeParse({ id: datos.get('id'), participante: datos.get('participante'), anfitrion: datos.get('anfitrion') ?? '' });
  const ruta = `${base(limpio(datos.get('id')))}/videollamada`;
  if (!r.success) ir(ruta, { error: 'enlace_invalido' });
  const { error } = await (await clienteSesion()).rpc('guardar_reunion', { p_taller: r.data.id, p_participante: r.data.participante, p_anfitrion: r.data.anfitrion });
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(r.data.id);
  ir(ruta, { ok: 'reunion_guardada' });
}

const RECORDATORIOS_PERMITIDOS = [10080, 2880, 1440, 180, 60, 15];
export async function guardarRecordatorios(datos: FormData) {
  await exigirAdminAccion();
  const id = uuid.safeParse(datos.get('id'));
  if (!id.success) redirect('/admin/talleres');
  const ruta = `${base(id.data)}/videollamada`;
  const elegidos = [...new Set(datos.getAll('minutos').map((v) => Number(v)))].filter((m) => RECORDATORIOS_PERMITIDOS.includes(m));
  const s = await clienteSesion();
  const { data: actuales } = await s.from('recordatorios').select('id, minutos_antes').eq('taller_id', id.data);
  const quitar = ((actuales ?? []) as { id: string; minutos_antes: number }[]).filter((a) => !elegidos.includes(a.minutos_antes)).map((a) => a.id);
  const agregar = elegidos.filter((m) => !(actuales ?? []).some((a) => (a as { minutos_antes: number }).minutos_antes === m));
  if (quitar.length) {
    const { error } = await s.from('recordatorios').delete().in('id', quitar);
    if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  }
  if (agregar.length) {
    const { error } = await s.from('recordatorios').insert(agregar.map((m) => ({ taller_id: id.data, minutos_antes: m })));
    if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  }
  refrescar(id.data);
  ir(ruta, { ok: 'recordatorios_guardados' });
}

export async function marcarAsistencia(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ taller: uuid, inscripcion: uuid, asistio: z.enum(['si', 'no']) })
    .safeParse({ taller: datos.get('taller'), inscripcion: datos.get('inscripcion'), asistio: datos.get('asistio') });
  if (!r.success) redirect('/admin/talleres');
  const ruta = `${base(r.data.taller)}/participantes`;
  const { error } = await (await clienteSesion()).rpc('marcar_asistencia', { p_inscripcion: r.data.inscripcion, p_asistio: r.data.asistio === 'si' });
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(r.data.taller);
  ir(ruta, { ok: 'asistencia' });
}

// ---------------------------------------------------------------- grabaciones (sin video real hasta la Fase 6)

const ESTADOS_GRABACION = ['recibida', 'en_revision', 'en_edicion', 'verificada', 'publicada', 'no_publicable', 'fallida', 'faltante', 'retirada'] as const;

export async function cambiarEstadoGrabacion(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ taller: uuid, grabacion: uuid, estado: z.enum(ESTADOS_GRABACION), motivo: texto(500) })
    .safeParse({ taller: datos.get('taller'), grabacion: datos.get('grabacion'), estado: datos.get('estado'), motivo: datos.get('motivo') ?? '' });
  if (!r.success) redirect('/admin/talleres');
  const ruta = `${base(r.data.taller)}/grabacion`;
  if (r.data.estado === 'publicada' && String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'PUBLICAR') ir(ruta, { error: 'confirmacion' });
  const { error } = await (await clienteSesion()).rpc('cambiar_estado_grabacion', { p_grabacion: r.data.grabacion, p_estado: r.data.estado, p_motivo: r.data.motivo || null });
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(r.data.taller);
  ir(ruta, { ok: `grabacion_${r.data.estado}` });
}

export async function guardarRevisionGrabacion(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ taller: uuid, grabacion: uuid }).safeParse({ taller: datos.get('taller'), grabacion: datos.get('grabacion') });
  if (!r.success) redirect('/admin/talleres');
  const ruta = `${base(r.data.taller)}/grabacion`;
  const si = (n: string) => datos.get(n) === 'si';
  const { error } = await (await clienteSesion()).rpc('guardar_revision_grabacion', {
    p_grabacion: r.data.grabacion, p_sin_imagen: si('sin_imagen'), p_sin_voces: si('sin_voces'), p_sin_datos: si('sin_datos'), p_contenido: si('contenido'),
  });
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(r.data.taller);
  ir(ruta, { ok: 'revision_guardada' });
}

export async function guardarCondicionesGrabacion(datos: FormData) {
  await exigirAdminAccion();
  const dias = z.union([z.literal(''), z.coerce.number().int().min(1).max(3650)]);
  const r = z.object({ taller: uuid, grabacion: uuid, incluido: z.enum(['dias', 'sin_vencimiento', 'sin_definir']), incluidoDias: dias,
    compra: z.enum(['dias', 'sin_vencimiento', 'sin_definir']), compraDias: dias })
    .safeParse({ taller: datos.get('taller'), grabacion: datos.get('grabacion'), incluido: datos.get('incluido'), incluidoDias: datos.get('incluidoDias') ?? '',
      compra: datos.get('compra'), compraDias: datos.get('compraDias') ?? '' });
  const ruta = `${base(limpio(datos.get('taller')))}/grabacion`;
  if (!r.success) ir(ruta, { error: 'condiciones_invalidas' });
  const d = r.data;
  if ((d.incluido === 'dias' && d.incluidoDias === '') || (d.compra === 'dias' && d.compraDias === '')) ir(ruta, { error: 'condiciones_invalidas' });
  const aLaVenta = datos.get('aLaVenta') === 'si';
  const precioTexto = String(datos.get('precio') ?? '').trim();
  const precio = precioTexto ? precioACentavos(precioTexto) : null;
  if (precioTexto && (precio === null || precio <= 0)) ir(ruta, { error: 'condiciones_invalidas' });
  const { error } = await (await clienteSesion()).rpc('guardar_condiciones_grabacion', {
    p_grabacion: d.grabacion,
    p_incluido_dias: d.incluido === 'dias' ? Number(d.incluidoDias) : null, p_incluido_sin_venc: d.incluido === 'sin_vencimiento',
    p_compra_dias: d.compra === 'dias' ? Number(d.compraDias) : null, p_compra_sin_venc: d.compra === 'sin_vencimiento',
    p_a_la_venta: aLaVenta, p_precio: precio,
  });
  if (error) ir(ruta, { error: codigoErrorTaller(error.message) });
  refrescar(d.taller);
  ir(ruta, { ok: 'condiciones_guardadas' });
}

export async function anotarIncidencia(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, nota: texto(1000) }).safeParse({ id: datos.get('id'), nota: datos.get('nota') ?? '' });
  if (!r.success) redirect('/admin/talleres/incidencias');
  const { error } = await (await clienteSesion()).rpc('anotar_incidencia', { p_incidencia: r.data.id, p_nota: r.data.nota });
  if (error) ir('/admin/talleres/incidencias', { error: codigoErrorTaller(error.message) });
  revalidatePath('/admin/talleres/incidencias');
  ir('/admin/talleres/incidencias', { ok: 'incidencia_anotada' });
}

/**
 * Registra por escrito cómo se resolvió un reembolso parcial. No modifica accesos, períodos ni compras: la
 * política comercial para reembolsos parciales todavía no está aprobada (decisión B, 01/11/2026).
 */
export async function resolverReembolsoParcial(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, resolucion: texto(1000) }).safeParse({ id: datos.get('id'), resolucion: datos.get('resolucion') ?? '' });
  if (!r.success) redirect('/admin/talleres/incidencias');
  const { error } = await (await clienteSesion()).rpc('resolver_reembolso_parcial', { p_incidencia: r.data.id, p_resolucion: r.data.resolucion });
  if (error) ir('/admin/talleres/incidencias', { error: codigoErrorTaller(error.message) });
  revalidatePath('/admin/talleres/incidencias');
  ir('/admin/talleres/incidencias', { ok: 'reembolso_parcial_resuelto' });
}

/** Reintenta dar el acceso de un pago confirmado cuyo otorgamiento falló. Idempotente; lo registra la base. */
export async function reintentarOtorgamiento(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, nota: texto(1000) }).safeParse({ id: datos.get('id'), nota: datos.get('nota') ?? '' });
  if (!r.success) redirect('/admin/talleres/incidencias');
  const { data, error } = await (await clienteSesion()).rpc('reintentar_otorgamiento', { p_incidencia: r.data.id, p_nota: r.data.nota });
  if (error) ir('/admin/talleres/incidencias', { error: codigoErrorTaller(error.message) });
  revalidatePath('/admin/talleres/incidencias');
  revalidatePath('/campus', 'layout');
  ir('/admin/talleres/incidencias', { ok: data ? 'otorgamiento_recuperado' : 'otorgamiento_pendiente' });
}

function mensaje(m: string | undefined) {
  return MENSAJES_FORM[codigoErrorTaller(m)] ?? 'No se pudo guardar. Intente de nuevo; si sigue fallando, avísenos.';
}
function campoDeError(m: string) {
  const c = codigoErrorTaller(m);
  return c === 'cupo_menor_que_ocupados' ? 'cupo' : c === 'usar_reprogramar' || c === 'taller_incompleto' ? 'fecha' : c === 'slug_repetido' ? 'slug' : undefined;
}
const MENSAJES_FORM: Record<string, string> = {
  cupo_menor_que_ocupados: 'El cupo no puede ser menor que los lugares ya ocupados (inscriptos y reservas vigentes).',
  usar_reprogramar: 'Este taller tiene inscriptos o reservas: para cambiar la fecha use «Reprogramar» en la pestaña Estado (pide motivo y avisa a cada persona).',
  taller_cerrado: 'Un taller cancelado, finalizado o archivado no cambia de fecha, cupo ni precio.',
  zona_invalida: 'Elija una zona horaria de la lista.',
  slug_repetido: 'Ya existe otro taller con esa dirección web.',
  taller_incompleto: 'La fecha nueva tiene que ser futura y durar como máximo 12 horas.',
};
