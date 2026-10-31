'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAdminAccion } from '@/datos/sesion';
import { clienteServicio, clienteSesion } from '@/datos/supabase';
import { codigoError, mensajeError, precioACentavos, slugDesde, SLUG_VALIDO, UUID, volverSeguro } from '@/dominio/cursos-admin';

/**
 * Acciones del editor de cursos. Todas empiezan con exigirAdminAccion() y escriben con la sesión
 * de la admin: RLS vuelve a exigir el rol y los disparadores registran la actividad con su nombre.
 * Las reglas de historial (no borrar lo que tiene historial, etc.) las aplica la base.
 */

export type Estado = { error?: string; ok?: string; campo?: string } | undefined;

const uuid = z.string().regex(UUID);
const texto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) => texto(max).transform((v) => (v === '' ? null : v));

function ir(ruta: string, aviso: { error?: string; ok?: string }): never {
  const q = new URLSearchParams();
  if (aviso.error) q.set('error', aviso.error);
  if (aviso.ok) q.set('ok', aviso.ok);
  redirect(`${ruta}?${q}`);
}

function refrescar(cursoId?: string) {
  revalidatePath('/admin/cursos', 'layout');
  if (cursoId) revalidatePath(`/admin/cursos/${cursoId}`, 'layout');
  revalidatePath('/cursos', 'layout');
  revalidatePath('/campus', 'layout');
}

// ---------------------------------------------------------------- cursos

export async function crearCurso(_: Estado, datos: FormData): Promise<Estado> {
  await exigirAdminAccion();
  const titulo = texto(140).min(3, 'Escriba un título de al menos 3 letras.').safeParse(datos.get('titulo'));
  if (!titulo.success) return { error: titulo.error.issues[0]?.message, campo: 'titulo' };
  const precio = precioACentavos(String(datos.get('precio') ?? '0') || '0');
  if (precio === null) return { error: 'Escriba el precio en dólares, por ejemplo 49 o 49.50.', campo: 'precio' };
  const base = slugDesde(titulo.data) || 'curso';
  const s = await clienteSesion();
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base.slice(0, 56)}-${i + 1}`;
    const { data, error } = await s.from('cursos').insert({ titulo: titulo.data, slug, precio_centavos: precio }).select('id').single();
    if (!error && data) {
      refrescar();
      redirect(`/admin/cursos/${data.id}?ok=creado`);
    }
    if (!error?.message.includes('duplicate key')) return { error: mensajeError(error?.message) };
  }
  return { error: mensajeError('slug_repetido') };
}

export async function guardarDatosCurso(_: Estado, datos: FormData): Promise<Estado> {
  await exigirAdminAccion();
  const r = z.object({
    id: uuid,
    titulo: texto(140).min(3, 'Escriba un título de al menos 3 letras.'),
    slug: texto(60).regex(SLUG_VALIDO, 'La dirección web solo puede tener minúsculas, números y guiones.'),
    resumen: opcional(240),
    descripcion: opcional(8000),
    requisitos: opcional(2000),
    objetivos: texto(4000),
    publico: z.array(z.enum(['familias', 'docentes', 'cuidadores'])),
    edadDesde: z.coerce.number().int().min(0).max(6),
    edadHasta: z.coerce.number().int().min(0).max(6),
    duracionHoras: z.string().trim().refine((v) => v === '' || /^\d{1,3}([.,]\d)?$/.test(v), 'Escriba la duración en horas, por ejemplo 4 o 4.5.'),
    video: z.string().trim().refine((v) => v === '' || UUID.test(v), 'El id de video de Bunny tiene el formato 8-4-4-4-12 (letras y números).'),
    duracionComercial: z.string().trim().refine((v) => v === '' || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 60),
      'La duración comercial va de 1 a 60 meses (o vacía mientras no la defina).'),
  }).refine((d) => d.edadDesde <= d.edadHasta, { message: 'La edad "desde" no puede ser mayor que la edad "hasta".', path: ['edadDesde'] })
    .safeParse({
      id: datos.get('id'), titulo: datos.get('titulo'), slug: datos.get('slug'), resumen: datos.get('resumen') ?? '',
      descripcion: datos.get('descripcion') ?? '', requisitos: datos.get('requisitos') ?? '', objetivos: datos.get('objetivos') ?? '',
      publico: datos.getAll('publico'), edadDesde: datos.get('edadDesde'), edadHasta: datos.get('edadHasta'),
      duracionHoras: datos.get('duracionHoras') ?? '', video: datos.get('video') ?? '',
      duracionComercial: datos.get('duracionComercial') ?? '',
    });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const precio = precioACentavos(String(datos.get('precio') ?? ''));
  if (precio === null) return { error: 'Escriba el precio en dólares, por ejemplo 49 o 49.50.', campo: 'precio' };
  const d = r.data;
  const s = await clienteSesion();
  const { error } = await s.from('cursos').update({
    titulo: d.titulo, slug: d.slug, resumen: d.resumen, descripcion: d.descripcion, requisitos: d.requisitos,
    objetivos: d.objetivos.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12),
    publico: d.publico, edad_desde_meses: d.edadDesde * 12, edad_hasta_meses: d.edadHasta * 12,
    duracion_minutos: d.duracionHoras ? Math.round(Number(d.duracionHoras.replace(',', '.')) * 60) || null : null,
    precio_centavos: precio, video_presentacion_id: d.video || null,
    duracion_comercial_meses: d.duracionComercial ? Number(d.duracionComercial) : null,
  }).eq('id', d.id);
  if (error) return { error: mensajeError(error.message), campo: error.message.includes('slug') ? 'slug' : undefined };
  refrescar(d.id);
  return { ok: 'Cambios guardados.' };
}

const PALABRAS: Record<string, string> = { archivado: 'ARCHIVAR', borrador: 'BORRADOR' };

export async function cambiarEstadoCurso(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, estado: z.enum(['publicado', 'archivado', 'borrador']), confirmacion: z.string().optional() })
    .safeParse({ id: datos.get('id'), estado: datos.get('estado'), confirmacion: datos.get('confirmacion') ?? undefined });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.id}/publicacion`;
  const palabra = PALABRAS[r.data.estado];
  if (palabra && r.data.confirmacion?.trim().toUpperCase() !== palabra) ir(ruta, { error: 'confirmacion' });
  const { error } = await (await clienteSesion()).from('cursos').update({ estado: r.data.estado }).eq('id', r.data.id);
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.id);
  ir(ruta, { ok: r.data.estado });
}

export async function eliminarCurso(datos: FormData) {
  await exigirAdminAccion();
  const id = uuid.safeParse(datos.get('id'));
  if (!id.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${id.data}/publicacion`;
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'ELIMINAR') ir(ruta, { error: 'confirmacion' });
  const s = await clienteSesion();
  const rutas = await rutasDeMateriales({ curso: id.data });
  const { error } = await s.from('cursos').delete().eq('id', id.data);
  if (error) ir(ruta, { error: codigoError(error.message) });
  await borrarArchivos(rutas);
  refrescar();
  ir('/admin/cursos', { ok: 'eliminado' });
}

// ---------------------------------------------------------------- temario

export async function crearModulo(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ curso: uuid, titulo: texto(140).min(2) }).safeParse({ curso: datos.get('curso'), titulo: datos.get('titulo') });
  if (!r.success) ir(`/admin/cursos/${datos.get('curso')}/temario`.replace(/[^a-z0-9/-]/gi, ''), { error: 'titulo_vacio' });
  const s = await clienteSesion();
  const { data: ultimo } = await s.from('modulos').select('orden').eq('curso_id', r.data.curso).order('orden', { ascending: false }).limit(1).maybeSingle();
  const { error } = await s.from('modulos').insert({ curso_id: r.data.curso, titulo: r.data.titulo, orden: (ultimo?.orden ?? -1) + 1 });
  const ruta = `/admin/cursos/${r.data.curso}/temario`;
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.curso);
  ir(ruta, { ok: 'modulo_agregado' });
}

/** Corrección menor del nombre de un módulo que está en una versión publicada. */
export async function corregirModulo(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, curso: uuid, titulo: texto(140).min(2), tipo: texto(40), motivo: texto(500) })
    .safeParse({ id: datos.get('id'), curso: datos.get('curso'), titulo: datos.get('titulo'), tipo: datos.get('tipo_correccion') ?? '', motivo: datos.get('motivo') ?? '' });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.curso}/temario`;
  const { error } = await (await clienteSesion()).rpc('corregir_modulo_publicado', {
    p_modulo: r.data.id, p_titulo: r.data.titulo, p_tipo: r.data.tipo, p_motivo: r.data.motivo,
  });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.curso);
  ir(ruta, { ok: 'correccion_aplicada' });
}

/** Cambio sustancial: lección de reemplazo en el borrador; la original queda intacta en sus versiones. */
export async function reemplazarLeccion(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, curso: uuid }).safeParse({ id: datos.get('id'), curso: datos.get('curso') });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.curso}/temario/${r.data.id}`;
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'REEMPLAZAR') ir(ruta, { error: 'confirmacion' });
  const { data, error } = await (await clienteSesion()).rpc('reemplazar_leccion', { p_leccion: r.data.id });
  if (error || !data) ir(ruta, { error: codigoError(error?.message) });
  refrescar(r.data.curso);
  ir(`/admin/cursos/${r.data.curso}/temario/${data as string}`, { ok: 'leccion_reemplazada' });
}

/** Material complementario: la admin elige a qué versiones se asocia (no cambia requisitos). */
export async function asociarComplemento(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, versiones: z.array(uuid).max(50) }).safeParse({ id: datos.get('id'), versiones: datos.getAll('versiones') });
  const ruta = volverSeguro(datos.get('volver'), '/admin/cursos');
  if (!r.success) ir(ruta, { error: 'invalido' });
  const { error } = await (await clienteSesion()).rpc('asociar_complemento', { p_recurso: r.data.id, p_versiones: r.data.versiones });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar();
  ir(ruta, { ok: 'complemento_asociado' });
}

export async function renombrarModulo(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, curso: uuid, titulo: texto(140).min(2) }).safeParse({ id: datos.get('id'), curso: datos.get('curso'), titulo: datos.get('titulo') });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.curso}/temario`;
  const { error } = await (await clienteSesion()).from('modulos').update({ titulo: r.data.titulo }).eq('id', r.data.id);
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.curso);
  ir(ruta, { ok: 'modulo_renombrado' });
}

export async function crearLeccion(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ curso: uuid, modulo: uuid, titulo: texto(140).min(2) })
    .safeParse({ curso: datos.get('curso'), modulo: datos.get('modulo'), titulo: datos.get('titulo') });
  if (!r.success) ir(`/admin/cursos/${String(datos.get('curso')).replace(/[^a-z0-9-]/gi, '')}/temario`, { error: 'titulo_vacio' });
  const s = await clienteSesion();
  const { data: ultimo } = await s.from('lecciones').select('orden').eq('modulo_id', r.data.modulo).order('orden', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await s.from('lecciones')
    .insert({ modulo_id: r.data.modulo, titulo: r.data.titulo, orden: (ultimo?.orden ?? -1) + 1 }).select('id').single();
  if (error || !data) ir(`/admin/cursos/${r.data.curso}/temario`, { error: codigoError(error?.message) });
  refrescar(r.data.curso);
  ir(`/admin/cursos/${r.data.curso}/temario/${data.id}`, { ok: 'leccion_creada' });
}

export async function guardarLeccion(_: Estado, datos: FormData): Promise<Estado> {
  await exigirAdminAccion();
  const r = z.object({
    id: uuid, curso: uuid,
    titulo: texto(140).min(2, 'Escriba un título.'),
    descripcion: opcional(8000),
    duracion: z.string().trim().refine((v) => v === '' || /^\d{1,3}$/.test(v), 'La duración va en minutos enteros.'),
    video: z.string().trim().refine((v) => v === '' || UUID.test(v), 'El id de video de Bunny tiene el formato 8-4-4-4-12 (letras y números).'),
  }).safeParse({
    id: datos.get('id'), curso: datos.get('curso'), titulo: datos.get('titulo'), descripcion: datos.get('descripcion') ?? '',
    duracion: datos.get('duracion') ?? '', video: datos.get('video') ?? '',
  });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const d = r.data;
  const s = await clienteSesion();
  // Lección de una versión publicada: solo una corrección menor declarada (la base lo exige).
  const { count: enVersion } = await clienteServicio().from('version_lecciones').select('leccion_id', { count: 'exact', head: true }).eq('leccion_id', d.id);
  if ((enVersion ?? 0) > 0) {
    const tipo = String(datos.get('tipo_correccion') ?? '');
    const motivo = String(datos.get('motivo') ?? '').trim().slice(0, 500);
    if (!tipo) return { error: mensajeError('tipo_correccion_invalido'), campo: 'tipo_correccion' };
    if (motivo.length < 10) return { error: mensajeError('motivo_requerido'), campo: 'motivo' };
    const { error } = await s.rpc('corregir_leccion_publicada', {
      p_leccion: d.id, p_titulo: d.titulo, p_descripcion: d.descripcion ?? '', p_duracion: d.duracion ? Number(d.duracion) || null : null,
      p_video: d.video || null, p_tipo: tipo, p_motivo: motivo,
    });
    if (error) return { error: mensajeError(error.message) };
    refrescar(d.curso);
    return { ok: 'Corrección menor aplicada en todas las versiones y registrada con su tipo y motivo.' };
  }
  // video_id se escribe pero no se lee desde el cliente (columna reservada al servidor).
  const { error } = await s.from('lecciones').update({
    titulo: d.titulo, descripcion: d.descripcion, duracion_minutos: d.duracion ? Number(d.duracion) || null : null, video_id: d.video || null,
  }).eq('id', d.id);
  if (error) return { error: mensajeError(error.message) };
  refrescar(d.curso);
  return { ok: 'Lección guardada.' };
}

const TABLAS = z.enum(['modulos', 'lecciones', 'preguntas']);
const COLUMNA_RETIRO = { modulos: 'retirado', lecciones: 'retirada', preguntas: 'retirada' } as const;

export async function moverElemento(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ tabla: TABLAS, id: uuid, direccion: z.enum(['-1', '1']) })
    .safeParse({ tabla: datos.get('tabla'), id: datos.get('id'), direccion: datos.get('direccion') });
  const ruta = volverSeguro(datos.get('volver'), '/admin/cursos');
  if (!r.success) ir(ruta, { error: 'invalido' });
  const { error } = await (await clienteSesion()).rpc('mover_en_orden', { p_tabla: r.data.tabla, p_id: r.data.id, p_direccion: Number(r.data.direccion) });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(String(datos.get('curso') ?? '') || undefined);
  redirect(ruta);
}

export async function retirarElemento(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ tabla: TABLAS, id: uuid, retirar: z.enum(['si', 'no']) })
    .safeParse({ tabla: datos.get('tabla'), id: datos.get('id'), retirar: datos.get('retirar') });
  const ruta = volverSeguro(datos.get('volver'), '/admin/cursos');
  if (!r.success) ir(ruta, { error: 'invalido' });
  const { error } = await (await clienteSesion()).from(r.data.tabla)
    .update({ [COLUMNA_RETIRO[r.data.tabla]]: r.data.retirar === 'si' }).eq('id', r.data.id);
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(String(datos.get('curso') ?? '') || undefined);
  ir(ruta, { ok: r.data.retirar === 'si' ? 'retirado' : 'restaurado' });
}

export async function eliminarElemento(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ tabla: TABLAS, id: uuid }).safeParse({ tabla: datos.get('tabla'), id: datos.get('id') });
  const ruta = volverSeguro(datos.get('volver'), '/admin/cursos');
  if (!r.success) ir(ruta, { error: 'invalido' });
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'ELIMINAR') ir(ruta, { error: 'confirmacion' });
  const rutas = r.data.tabla === 'preguntas' ? [] : await rutasDeMateriales(r.data.tabla === 'modulos' ? { modulo: r.data.id } : { leccion: r.data.id });
  const { error } = await (await clienteSesion()).from(r.data.tabla).delete().eq('id', r.data.id);
  if (error) ir(ruta, { error: codigoError(error.message) });
  await borrarArchivos(rutas);
  refrescar(String(datos.get('curso') ?? '') || undefined);
  ir(volverSeguro(datos.get('despues'), ruta), { ok: 'eliminado' });
}

// ---------------------------------------------------------------- materiales (PDF)

const MAX_PDF = 25 * 1024 * 1024;

/** Paso 1: el servidor firma una subida directa al bucket privado (sin pasar el archivo por la aplicación). */
export async function prepararSubida(leccionId: string, nombre: string, tamano: number): Promise<{ ruta: string; token: string } | { error: string }> {
  await exigirAdminAccion();
  if (!UUID.test(leccionId)) return { error: 'Lección inválida.' };
  if (!/\.pdf$/i.test(nombre)) return { error: 'Solo se aceptan archivos PDF.' };
  if (!Number.isInteger(tamano) || tamano <= 0 || tamano > MAX_PDF) return { error: 'El PDF debe pesar como máximo 25 MB.' };
  const { data: leccion } = await (await clienteSesion()).from('lecciones').select('id, modulos(curso_id)').eq('id', leccionId).maybeSingle();
  if (!leccion) return { error: 'Lección inválida.' };
  const curso = (Array.isArray(leccion.modulos) ? leccion.modulos[0] : leccion.modulos) as { curso_id: string } | null;
  const ruta = `cursos/${curso?.curso_id}/${leccionId}/${randomUUID()}.pdf`;
  const { data, error } = await clienteServicio().storage.from('materiales').createSignedUploadUrl(ruta);
  if (error || !data) return { error: 'No se pudo preparar la subida. Revise que el almacenamiento esté configurado.' };
  return { ruta, token: data.token };
}

/** Paso 2: se verifica lo subido (tamaño y que sea un PDF de verdad) y se registra en la lección. */
export async function confirmarSubida(leccionId: string, ruta: string, titulo: string, tipo: 'complementario' | 'programa'): Promise<{ ok: true } | { error: string }> {
  await exigirAdminAccion();
  // No se asume ningún tipo: la admin elige si el PDF es complementario o parte del programa.
  if (tipo !== 'complementario' && tipo !== 'programa') return { error: 'Elija si el material es complementario o parte del programa.' };
  const t = titulo.trim().slice(0, 140);
  if (!UUID.test(leccionId) || !ruta.startsWith('cursos/') || !ruta.includes(`/${leccionId}/`) || !/^[a-z0-9/-]+\.pdf$/i.test(ruta)) {
    return { error: 'Subida inválida.' };
  }
  if (t.length < 2) return { error: 'Escriba un nombre para el material.' };
  const almacen = clienteServicio().storage.from('materiales');
  const carpeta = ruta.slice(0, ruta.lastIndexOf('/'));
  const archivo = ruta.slice(ruta.lastIndexOf('/') + 1);
  const { data: lista } = await almacen.list(carpeta, { search: archivo });
  const meta = lista?.find((o) => o.name === archivo)?.metadata as { size?: number } | undefined;
  const tamano = Number(meta?.size ?? 0);
  const { data: firmado } = await almacen.createSignedUrl(ruta, 60);
  const inicio = firmado ? await fetch(firmado.signedUrl, { headers: { Range: 'bytes=0-4' } }).then((r) => r.arrayBuffer()).catch(() => null) : null;
  const esPdf = inicio !== null && Buffer.from(inicio).subarray(0, 5).toString('latin1') === '%PDF-';
  if (!tamano || tamano > MAX_PDF || !esPdf) {
    await almacen.remove([ruta]);
    return { error: 'El archivo no es un PDF válido o supera los 25 MB.' };
  }
  const s = await clienteSesion();
  const { data: ultimo } = await s.from('recursos_leccion').select('orden').eq('leccion_id', leccionId).order('orden', { ascending: false }).limit(1).maybeSingle();
  const { error } = await s.from('recursos_leccion').insert({
    leccion_id: leccionId, titulo: t, ruta_almacenamiento: ruta, tipo_mime: 'application/pdf', tamano_bytes: tamano, orden: (ultimo?.orden ?? -1) + 1,
    complementario: tipo === 'complementario',
  });
  if (error) {
    await almacen.remove([ruta]);
    return { error: mensajeError(error.message) };
  }
  refrescar();
  return { ok: true };
}

export async function quitarMaterial(datos: FormData) {
  await exigirAdminAccion();
  const id = uuid.safeParse(datos.get('id'));
  const ruta = volverSeguro(datos.get('volver'), '/admin/cursos');
  if (!id.success) ir(ruta, { error: 'invalido' });
  const s = await clienteSesion();
  const { data: m } = await s.from('recursos_leccion').select('ruta_almacenamiento').eq('id', id.data).maybeSingle();
  // Si el material está en alguna versión publicada, se retira del borrador y el archivo se conserva.
  const { count } = await clienteServicio().from('version_materiales').select('recurso_id', { count: 'exact', head: true }).eq('recurso_id', id.data);
  if ((count ?? 0) > 0) {
    const r = await s.from('recursos_leccion').update({ retirado: true }).eq('id', id.data);
    if (r.error) ir(ruta, { error: codigoError(r.error.message) });
    refrescar();
    ir(ruta, { ok: 'material_retirado' });
  }
  const { error } = await s.from('recursos_leccion').delete().eq('id', id.data);
  if (error) ir(ruta, { error: codigoError(error.message) });
  if (m?.ruta_almacenamiento) await borrarArchivos([m.ruta_almacenamiento]);
  refrescar();
  ir(ruta, { ok: 'material_quitado' });
}

async function rutasDeMateriales(donde: { curso?: string; modulo?: string; leccion?: string }): Promise<string[]> {
  const s = await clienteSesion();
  let q = s.from('recursos_leccion').select('ruta_almacenamiento, lecciones!inner(id, modulo_id, modulos!inner(curso_id))');
  if (donde.leccion) q = q.eq('leccion_id', donde.leccion);
  if (donde.modulo) q = q.eq('lecciones.modulo_id', donde.modulo);
  if (donde.curso) q = q.eq('lecciones.modulos.curso_id', donde.curso);
  const { data } = await q;
  return ((data ?? []) as { ruta_almacenamiento: string }[]).map((r) => r.ruta_almacenamiento);
}

async function borrarArchivos(rutas: string[]) {
  if (!rutas.length) return;
  // Una lección de reemplazo reutiliza el mismo archivo: solo se borra si ningún material lo usa ya.
  const { data: enUso } = await clienteServicio().from('recursos_leccion').select('ruta_almacenamiento').in('ruta_almacenamiento', rutas);
  const usadas = new Set(((enUso ?? []) as { ruta_almacenamiento: string }[]).map((r) => r.ruta_almacenamiento));
  const libres = rutas.filter((r) => !usadas.has(r));
  if (libres.length) await clienteServicio().storage.from('materiales').remove(libres);
}

// ---------------------------------------------------------------- evaluación

export async function guardarCriterios(_: Estado, datos: FormData): Promise<Estado> {
  await exigirAdminAccion();
  const r = z.object({
    curso: uuid,
    modalidad: z.enum(['sumativa', 'formativa'], { errorMap: () => ({ message: 'Elija la forma de evaluar.' }) }),
    puntaje: z.coerce.number({ invalid_type_error: 'El puntaje mínimo va de 0 a 100.' }).int().min(0, 'El puntaje mínimo va de 0 a 100.').max(100, 'El puntaje mínimo va de 0 a 100.'),
    intentos: z.string().trim().refine((v) => v === '' || (/^\d{1,2}$/.test(v) && Number(v) > 0), 'Los intentos van de 1 a 99, o vacío para no limitar.'),
    aprobado: texto(300).min(2, 'Escriba el mensaje para quien aprueba.'),
    desaprobado: texto(300).min(2, 'Escriba el mensaje para quien no aprueba.'),
  }).safeParse({
    curso: datos.get('curso'), modalidad: datos.get('modalidad') ?? 'sumativa', puntaje: datos.get('puntaje'), intentos: datos.get('intentos') ?? '',
    aprobado: datos.get('aprobado'), desaprobado: datos.get('desaprobado'),
  });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const d = r.data;
  // La sumativa no usa requisitos formativos (la base lo exige con una restricción).
  const formativa = d.modalidad === 'formativa';
  const { error } = await (await clienteSesion()).from('evaluaciones').upsert({
    curso_id: d.curso, puntaje_minimo: d.puntaje, intentos_permitidos: d.intentos ? Number(d.intentos) : null,
    mensaje_aprobado: d.aprobado, mensaje_desaprobado: d.desaprobado, modalidad: d.modalidad,
    requiere_actividades: formativa && datos.get('actividades') === 'si',
    requiere_validacion: formativa && datos.get('validacion') === 'si',
    con_certificado: !formativa || datos.get('certificado') === 'si',
  }, { onConflict: 'curso_id' });
  if (error) return { error: mensajeError(error.message) };
  refrescar(d.curso);
  return { ok: formativa ? 'Configuración guardada.' : 'Criterios guardados. Valen para los próximos intentos.' };
}

const opcionesEsquema = z.array(z.object({
  id: z.string().regex(UUID).nullable(),
  texto: z.string().trim().min(1, 'Ninguna opción puede quedar vacía.').max(300),
  es_correcta: z.boolean(),
})).min(2, 'Escriba al menos 2 opciones.').max(10, 'Como máximo 10 opciones.');

export async function guardarPregunta(_: Estado, datos: FormData): Promise<Estado> {
  await exigirAdminAccion();
  let opciones: unknown;
  try { opciones = JSON.parse(String(datos.get('opciones') ?? '[]')); } catch { return { error: 'No se pudieron leer las opciones.' }; }
  const r = z.object({
    curso: uuid,
    pregunta: z.string().regex(UUID).nullable(),
    enunciado: texto(1000).min(3, 'Escriba la pregunta.'),
    tipo: z.enum(['unica', 'multiple']),
    tema: texto(80),
    opciones: opcionesEsquema,
  }).safeParse({
    curso: datos.get('curso'), pregunta: datos.get('pregunta') || null, enunciado: datos.get('enunciado'),
    tipo: datos.get('tipo'), tema: datos.get('tema') ?? '', opciones,
  });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const d = r.data;
  const s = await clienteSesion();
  let { data: ev } = await s.from('evaluaciones').select('id').eq('curso_id', d.curso).maybeSingle();
  if (!ev) {
    const creada = await s.from('evaluaciones').insert({ curso_id: d.curso }).select('id').single();
    if (creada.error) return { error: mensajeError(creada.error.message) };
    ev = creada.data;
  }
  const { data: id, error } = await s.rpc('guardar_pregunta', {
    p_evaluacion: ev.id, p_pregunta: d.pregunta, p_enunciado: d.enunciado, p_tipo: d.tipo, p_tema: d.tema, p_opciones: d.opciones,
  });
  if (error) return { error: mensajeError(error.message) };
  refrescar(d.curso);
  if (!d.pregunta) redirect(`/admin/cursos/${d.curso}/evaluacion/${id as string}?ok=pregunta_creada`);
  // Una pregunta que ya estaba en una versión publicada no se toca: la base crea una nueva para el borrador.
  if (id !== d.pregunta) redirect(`/admin/cursos/${d.curso}/evaluacion/${id as string}?ok=pregunta_reemplazada`);
  return { ok: 'Pregunta guardada.' };
}

// ---------------------------------------------------------------- versiones

/** Publica el borrador como una versión nueva. Los alumnos actuales no cambian de versión. */
export async function publicarVersion(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, resumen: texto(600), confirmacion: z.string() })
    .safeParse({ id: datos.get('id'), resumen: datos.get('resumen') ?? '', confirmacion: datos.get('confirmacion') ?? '' });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.id}/publicacion`;
  if (r.data.confirmacion.trim().toUpperCase() !== 'PUBLICAR') ir(ruta, { error: 'confirmacion' });
  const { error } = await (await clienteSesion()).rpc('publicar_version', { p_curso: r.data.id, p_resumen: r.data.resumen });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.id);
  ir(ruta, { ok: 'version_publicada' });
}

/** Paso 1 de la revisión favorable: calcula a quién beneficia. No cambia ningún resultado. */
export async function calcularRevision(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ curso: uuid, pregunta: uuid, version: uuid, opciones: z.array(uuid).min(1).max(10), motivo: texto(500) })
    .safeParse({ curso: datos.get('curso'), pregunta: datos.get('pregunta'), version: datos.get('version'),
      opciones: datos.getAll('opciones'), motivo: datos.get('motivo') ?? '' });
  const base = `/admin/cursos/${String(datos.get('curso') ?? '').replace(/[^0-9a-f-]/gi, '')}/evaluacion/${String(datos.get('pregunta') ?? '').replace(/[^0-9a-f-]/gi, '')}/revision`;
  if (!r.success) ir(base, { error: datos.getAll('opciones').length ? 'invalido' : 'opciones_invalidas' });
  const { data, error } = await (await clienteSesion()).rpc('calcular_revision', {
    p_version: r.data.version, p_pregunta: r.data.pregunta, p_opciones: r.data.opciones, p_motivo: r.data.motivo,
  });
  if (error || !data) ir(base, { error: codigoError(error?.message) });
  redirect(`${base}?calculo=${data as string}`);
}

/** Paso 2: confirmación diferenciada (escribir CORREGIR y la cantidad). Idempotente; solo sube resultados. */
export async function aplicarRevision(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ curso: uuid, pregunta: uuid, revision: uuid, confirmacion: texto(40) })
    .safeParse({ curso: datos.get('curso'), pregunta: datos.get('pregunta'), revision: datos.get('revision'), confirmacion: datos.get('confirmacion') ?? '' });
  if (!r.success) redirect('/admin/cursos');
  const base = `/admin/cursos/${r.data.curso}/evaluacion/${r.data.pregunta}/revision`;
  const { data, error } = await (await clienteSesion()).rpc('aplicar_revision', { p_revision: r.data.revision, p_confirmacion: r.data.confirmacion });
  if (error) redirect(`${base}?calculo=${r.data.revision}&error=${codigoError(error.message)}`);
  refrescar(r.data.curso);
  const estado = (data as { estado?: string } | null)?.estado;
  ir(base, { ok: estado === 'ya_aplicada' ? 'revision_ya_aplicada' : 'revision_aplicada' });
}

/** Bloqueo excepcional (contenido erróneo o dañino). Exige motivo; queda registrado. */
export async function bloquearContenido(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ tabla: z.enum(['lecciones', 'recursos_leccion', 'preguntas']), id: uuid, bloquear: z.enum(['si', 'no']), motivo: texto(500) })
    .safeParse({ tabla: datos.get('tabla'), id: datos.get('id'), bloquear: datos.get('bloquear'), motivo: datos.get('motivo') ?? '' });
  const ruta = volverSeguro(datos.get('volver'), '/admin/cursos');
  if (!r.success) ir(ruta, { error: 'invalido' });
  const palabra = r.data.bloquear === 'si' ? 'BLOQUEAR' : 'DESBLOQUEAR';
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== palabra) ir(ruta, { error: 'confirmacion' });
  const { error } = await (await clienteSesion()).rpc('bloquear_contenido', {
    p_tabla: r.data.tabla, p_id: r.data.id, p_bloquear: r.data.bloquear === 'si', p_motivo: r.data.motivo,
  });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar();
  ir(ruta, { ok: r.data.bloquear === 'si' ? 'bloqueado' : 'desbloqueado' });
}

// ---------------------------------------------------------------- seguimiento formativo

/** La maestra valida la finalización de una persona (modalidad formativa). La base exige admin y nota. */
export async function validarFinalizacion(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ curso: uuid, perfil: uuid, nota: texto(1000) })
    .safeParse({ curso: datos.get('curso'), perfil: datos.get('perfil'), nota: datos.get('nota') ?? '' });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.curso}/alumnos`;
  const { error } = await (await clienteSesion()).rpc('validar_finalizacion', { p_perfil: r.data.perfil, p_curso: r.data.curso, p_nota: r.data.nota });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.curso);
  ir(ruta, { ok: 'validada' });
}

/** Anula una validación hecha por error (solo si todavía no hay certificado de esa versión). */
export async function anularValidacion(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ curso: uuid, validacion: uuid, motivo: texto(500) })
    .safeParse({ curso: datos.get('curso'), validacion: datos.get('validacion'), motivo: datos.get('motivo') ?? '' });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.curso}/alumnos`;
  const { error } = await (await clienteSesion()).rpc('anular_validacion', { p_validacion: r.data.validacion, p_motivo: r.data.motivo });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.curso);
  ir(ruta, { ok: 'validacion_anulada' });
}

// ---------------------------------------------------------------- revisión: descartar

/** Descarta una revisión favorable calculada y no aplicada. No cambia resultados; queda registrada con su motivo. */
export async function descartarRevision(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ curso: uuid, pregunta: uuid, revision: uuid, motivo: texto(500) })
    .safeParse({ curso: datos.get('curso'), pregunta: datos.get('pregunta'), revision: datos.get('revision'), motivo: datos.get('motivo') ?? '' });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.curso}/evaluacion/${r.data.pregunta}/revision`;
  const { error } = await (await clienteSesion()).rpc('descartar_revision', { p_revision: r.data.revision, p_motivo: r.data.motivo });
  if (error) ir(ruta, { error: codigoError(error.message) });
  refrescar(r.data.curso);
  ir(ruta, { ok: 'revision_descartada' });
}

// ---------------------------------------------------------------- duplicar

/**
 * Duplica un curso como borrador independiente (duplicar_curso) y copia sus PDF en el almacenamiento
 * con rutas propias. Si un archivo no se puede copiar, ese material no queda en la copia y se avisa.
 */
export async function duplicarCurso(datos: FormData) {
  await exigirAdminAccion();
  const r = z.object({ id: uuid, titulo: texto(140).min(3) }).safeParse({ id: datos.get('id'), titulo: datos.get('titulo') ?? '' });
  if (!r.success) redirect('/admin/cursos');
  const ruta = `/admin/cursos/${r.data.id}/publicacion`;
  const s = await clienteSesion();
  const { data, error } = await s.rpc('duplicar_curso', { p_curso: r.data.id, p_titulo: r.data.titulo });
  if (error || !data) ir(ruta, { error: codigoError(error?.message) });
  const d = data as { curso: string; materiales: { id: string; origen: string; destino: string }[] };
  const almacen = clienteServicio().storage.from('materiales');
  let fallidos = 0;
  for (const m of d.materiales) {
    const { error: e } = await almacen.copy(m.origen, m.destino);
    if (e) {
      fallidos++;
      await s.from('recursos_leccion').delete().eq('id', m.id);
    }
  }
  refrescar(d.curso);
  ir(`/admin/cursos/${d.curso}`, { ok: fallidos ? 'duplicado_sin_algunos_pdf' : 'duplicado' });
}
