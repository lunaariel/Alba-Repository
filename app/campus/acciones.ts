'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clienteSesion, clienteServicio } from '@/datos/supabase';
import { exigirSesion } from '@/datos/sesion';
import { cursoCampus } from '@/datos/campus';
import { respuestasDesdeFormulario } from '@/dominio/aprendizaje';

const uuid = z.string().uuid();
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Marca o desmarca una lección. Solo por acción explícita del alumno; RLS exige acceso al curso. */
export async function marcarLeccion(datos: FormData) {
  const usuario = await exigirSesion('/campus');
  const r = z.object({ curso: slug, leccion: uuid, completada: z.enum(['si', 'no']), siguiente: uuid.optional().or(z.literal('')) })
    .safeParse({ curso: datos.get('curso'), leccion: datos.get('leccion'), completada: datos.get('completada'), siguiente: datos.get('siguiente') ?? '' });
  if (!r.success) redirect('/campus');
  const supabase = await clienteSesion();
  const { error } = await supabase.from('progreso_leccion').upsert(
    {
      perfil_id: usuario.id, leccion_id: r.data.leccion, ultima_visita_en: new Date().toISOString(),
      completada_en: r.data.completada === 'si' ? new Date().toISOString() : null,
    },
    { onConflict: 'perfil_id,leccion_id' },
  );
  const base = `/campus/cursos/${r.data.curso}`;
  if (error) redirect(`${base}/lecciones/${r.data.leccion}?aviso=error`);
  revalidatePath('/campus', 'layout');
  if (r.data.completada === 'si' && r.data.siguiente) redirect(`${base}/lecciones/${r.data.siguiente}`);
  redirect(r.data.completada === 'si' && !r.data.siguiente ? base : `${base}/lecciones/${r.data.leccion}`);
}

export type ResultadoEvaluacion =
  | { puntaje: number; aprobado: boolean; mensaje: string; intentosRestantes: number | null }
  | { error: string }
  | undefined;

const ERRORES_EVALUACION: Record<string, string> = {
  sin_acceso: 'No tiene acceso a este curso.',
  lecciones_pendientes: 'Para rendir la evaluación primero complete todas las lecciones.',
  sin_intentos: 'Ya usó todos los intentos disponibles. Escríbanos si necesita ayuda.',
};

/** Envía las respuestas. La corrección ocurre en la base de datos; el navegador nunca recibe las correctas. */
export async function rendirEvaluacion(_: ResultadoEvaluacion, datos: FormData): Promise<ResultadoEvaluacion> {
  const usuario = await exigirSesion('/campus');
  const cursoSlug = slug.safeParse(datos.get('curso'));
  if (!cursoSlug.success) return { error: 'No encontramos el curso.' };
  const curso = await cursoCampus(cursoSlug.data);
  if (!curso?.evaluacion) return { error: 'No encontramos la evaluación de este curso.' };

  const respuestas = respuestasDesdeFormulario(datos.entries());
  const { data, error } = await clienteServicio().rpc('corregir_evaluacion', {
    p_perfil: usuario.id, p_evaluacion: curso.evaluacion.id, p_respuestas: respuestas,
  });
  if (error) {
    const clave = Object.keys(ERRORES_EVALUACION).find((k) => error.message.startsWith(k));
    return { error: clave ? ERRORES_EVALUACION[clave]! : 'No pudimos registrar sus respuestas. Intente de nuevo en unos minutos.' };
  }
  revalidatePath(`/campus/cursos/${cursoSlug.data}`);
  const d = data as { puntaje: number; aprobado: boolean; mensaje: string; intentos_restantes: number | null };
  return { puntaje: d.puntaje, aprobado: d.aprobado, mensaje: d.mensaje, intentosRestantes: d.intentos_restantes };
}

/** Emite el certificado (o devuelve el existente). La base valida las tres condiciones. */
export async function obtenerCertificado(datos: FormData) {
  const usuario = await exigirSesion('/campus');
  const cursoSlug = slug.safeParse(datos.get('curso'));
  if (!cursoSlug.success) redirect('/campus');
  const curso = await cursoCampus(cursoSlug.data);
  if (!curso) redirect('/campus');
  const { data, error } = await clienteServicio().rpc('emitir_certificado', { p_perfil: usuario.id, p_curso: curso.id });
  if (error || !data) redirect(`/campus/cursos/${cursoSlug.data}?aviso=certificado`);
  revalidatePath('/campus', 'layout');
  redirect(`/campus/cursos/${cursoSlug.data}?aviso=certificado-listo#certificado`);
}

export type EstadoCuenta = { error?: string; campo?: string; ok?: string } | undefined;

const ZONAS_VALIDAS = new Set(Intl.supportedValuesOf('timeZone'));

export async function guardarCuenta(_: EstadoCuenta, datos: FormData): Promise<EstadoCuenta> {
  const usuario = await exigirSesion('/campus/cuenta');
  const r = z.object({
    nombre: z.string().trim().min(2, 'Escriba su nombre completo.').max(120, 'El nombre es demasiado largo.'),
    zona: z.string().refine((z: string) => ZONAS_VALIDAS.has(z) || z === 'UTC', 'Elija una zona horaria de la lista.'),
  }).safeParse({ nombre: datos.get('nombre'), zona: datos.get('zona') });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const supabase = await clienteSesion();
  const { error } = await supabase.from('perfiles')
    .update({ nombre_completo: r.data.nombre, zona_horaria: r.data.zona }).eq('id', usuario.id);
  if (error) return { error: 'No pudimos guardar los cambios. Intente de nuevo.' };
  revalidatePath('/campus', 'layout');
  return { ok: 'Cambios guardados.' };
}

export async function cambiarContrasena(_: EstadoCuenta, datos: FormData): Promise<EstadoCuenta> {
  const usuario = await exigirSesion('/campus/cuenta');
  const r = z.object({
    actual: z.string().min(1, 'Escriba su contraseña actual.'),
    nueva: z.string().min(10, 'La contraseña nueva debe tener al menos 10 caracteres.'),
    repetir: z.string(),
  }).refine((d: { nueva: string; repetir: string }) => d.nueva === d.repetir, { message: 'Las contraseñas nuevas no coinciden.', path: ['repetir'] })
    .safeParse({ actual: datos.get('actual'), nueva: datos.get('nueva'), repetir: datos.get('repetir') });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const supabase = await clienteSesion();
  // Se confirma la contraseña actual antes de cambiarla.
  const { error: e1 } = await supabase.auth.signInWithPassword({ email: usuario.email ?? '', password: r.data.actual });
  if (e1) return { error: 'La contraseña actual no es correcta.', campo: 'actual' };
  const { error: e2 } = await supabase.auth.updateUser({ password: r.data.nueva });
  if (e2) return { error: 'No pudimos cambiar la contraseña. Pruebe con otra distinta de la anterior.' };
  return { ok: 'Contraseña actualizada.' };
}
