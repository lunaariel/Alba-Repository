'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { entornoPublico } from '@/config/entorno';
import { clienteSesion } from '@/datos/supabase';

export type EstadoFormulario = { error?: string; campo?: string; ok?: string } | undefined;

const correo = z.string().trim().toLowerCase().email('Escriba un correo electrónico válido.');
const contrasena = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.');

/** Solo se permite volver a rutas internas, para evitar redirecciones a otros sitios. */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const s = typeof valor === 'string' ? valor : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/campus';
}

export async function ingresar(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = z.object({ correo, contrasena: z.string().min(1, 'Escriba su contraseña.') })
    .safeParse({ correo: datos.get('correo'), contrasena: datos.get('contrasena') });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };

  const supabase = await clienteSesion();
  const { error } = await supabase.auth.signInWithPassword({ email: r.data.correo, password: r.data.contrasena });
  // Mensaje único para no revelar si el correo existe.
  if (error) return { error: 'El correo o la contraseña no coinciden. Revíselos e intente de nuevo.' };
  redirect(destinoSeguro(datos.get('siguiente')));
}

export async function registrarse(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = z.object({
    nombre: z.string().trim().min(2, 'Escriba su nombre como quiere que aparezca en sus certificados.').max(120),
    correo,
    contrasena,
    mayor: z.literal('on', { errorMap: () => ({ message: 'Para crear una cuenta debe confirmar que es mayor de edad.' }) }),
    promociones: z.string().optional(),
    zona: z.string().max(64).optional(),
  }).safeParse({
    nombre: datos.get('nombre'), correo: datos.get('correo'), contrasena: datos.get('contrasena'),
    mayor: datos.get('mayor'), promociones: datos.get('promociones') ?? undefined, zona: datos.get('zona') ?? undefined,
  });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };

  const supabase = await clienteSesion();
  const { error } = await supabase.auth.signUp({
    email: r.data.correo,
    password: r.data.contrasena,
    options: {
      emailRedirectTo: `${entornoPublico.NEXT_PUBLIC_URL_SITIO}/auth/confirmar?siguiente=/campus`,
      // La base de datos crea el perfil con estos datos y rechaza la cuenta sin mayoría de edad.
      data: {
        nombre_completo: r.data.nombre,
        confirma_mayoria_edad: true,
        acepta_promociones: r.data.promociones === 'on',
        zona_horaria: r.data.zona || 'America/Guatemala',
      },
    },
  });
  if (error) return { error: 'No pudimos crear la cuenta. Revise los datos o intente más tarde.' };
  return { ok: 'Le enviamos un correo para confirmar su cuenta. Abra el enlace para empezar.' };
}

export async function pedirRecuperacion(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = correo.safeParse(datos.get('correo'));
  if (!r.success) return { error: r.error.issues[0]?.message, campo: 'correo' };
  const supabase = await clienteSesion();
  await supabase.auth.resetPasswordForEmail(r.data, {
    redirectTo: `${entornoPublico.NEXT_PUBLIC_URL_SITIO}/auth/confirmar?siguiente=/restablecer`,
  });
  // Siempre la misma respuesta, exista o no la cuenta.
  return { ok: 'Si hay una cuenta con ese correo, le enviamos un enlace para elegir una nueva contraseña.' };
}

export async function restablecer(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = z.object({ contrasena, repetir: z.string() })
    .refine((d: { contrasena: string; repetir: string }) => d.contrasena === d.repetir, { message: 'Las dos contraseñas no coinciden.', path: ['repetir'] })
    .safeParse({ contrasena: datos.get('contrasena'), repetir: datos.get('repetir') });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };
  const supabase = await clienteSesion();
  const { error } = await supabase.auth.updateUser({ password: r.data.contrasena });
  if (error) return { error: 'El enlace venció o ya se usó. Pida uno nuevo desde «Olvidé mi contraseña».' };
  redirect('/campus');
}

export async function salir() {
  const supabase = await clienteSesion();
  await supabase.auth.signOut();
  redirect('/');
}
