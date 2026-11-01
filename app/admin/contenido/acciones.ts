'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clienteSesion } from '@/datos/supabase';
import { exigirAdminAccion } from '@/datos/sesion';

export type EstadoPresentacion = { error?: string; campo?: string; ok?: string } | undefined;

const texto = (max: number, nombre: string) => z.string().trim().max(max, `${nombre}: máximo ${max} caracteres.`);

/**
 * Guarda la presentación de la maestra en configuracion_academia.textos (se combina con lo existente).
 * Lema y trayectoria se muestran en el sitio solo cuando la maestra marca que los revisó y aprobó.
 */
export async function guardarPresentacion(_: EstadoPresentacion, datos: FormData): Promise<EstadoPresentacion> {
  await exigirAdminAccion();
  const r = z.object({
    maestraNombre: texto(120, 'Nombre').min(2, 'Escriba el nombre.'),
    maestraLema: texto(160, 'Frase de presentación'),
    maestraResumen: texto(600, 'Resumen'),
    maestraFrase: texto(300, 'Frase'),
    maestraHistoria: texto(8000, 'Historia'),
    trayectoria: texto(4000, 'Trayectoria'),
  }).safeParse({
    maestraNombre: datos.get('maestraNombre') ?? '', maestraLema: datos.get('maestraLema') ?? '', maestraResumen: datos.get('maestraResumen') ?? '',
    maestraFrase: datos.get('maestraFrase') ?? '', maestraHistoria: datos.get('maestraHistoria') ?? '', trayectoria: datos.get('trayectoria') ?? '',
  });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const trayectoria = r.data.trayectoria.split('\n').map((x) => x.trim()).filter(Boolean);
  if (trayectoria.length > 20) return { error: 'Como máximo 20 líneas de trayectoria.', campo: 'trayectoria' };
  const aprobada = datos.get('aprobada') === 'si';
  const s = await clienteSesion();
  const { data: actual } = await s.from('configuracion_academia').select('textos').maybeSingle();
  const textos = {
    ...((actual?.textos ?? {}) as Record<string, unknown>),
    maestraNombre: r.data.maestraNombre, maestraLema: r.data.maestraLema, maestraResumen: r.data.maestraResumen,
    maestraFrase: r.data.maestraFrase, maestraHistoria: r.data.maestraHistoria, maestraTrayectoria: trayectoria, presentacionAprobada: aprobada,
  };
  const { error } = await s.from('configuracion_academia').update({ textos }).eq('id', true);
  if (error) return { error: 'No se pudo guardar. Intente de nuevo.' };
  revalidatePath('/la-maestra');
  revalidatePath('/admin/contenido');
  return { ok: aprobada ? 'Guardado y publicado en «La maestra».' : 'Guardado como borrador: el lema y la trayectoria no se muestran en el sitio hasta que marque la aprobación.' };
}
