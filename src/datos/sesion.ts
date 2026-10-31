import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { clienteSesion } from './supabase';

/** Persona con sesión verificada contra Supabase Auth (getUser valida el token en el servidor). */
export async function usuarioActual() {
  const supabase = await clienteSesion();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function exigirSesion(destino = '/campus') {
  const usuario = await usuarioActual();
  if (!usuario) redirect(`/ingresar?siguiente=${encodeURIComponent(destino)}`);
  return usuario;
}

/** El rol se lee de roles_usuario en cada solicitud; nunca del token ni de un dato del navegador. */
export async function esAdmin(): Promise<boolean> {
  const supabase = await clienteSesion();
  const { data, error } = await supabase.rpc('es_admin');
  return !error && data === true;
}

/**
 * MFA de la administradora (preparado, NO activo). Se exige solo si ADMIN_MFA_OBLIGATORIO=si.
 * No se activa hasta tener la pantalla de enrolamiento y verificación (TOTP) y el factor de la maestra
 * registrado: activarlo antes la dejaría sin acceso al panel.
 */
export function mfaAdminObligatorio(): boolean {
  return process.env.ADMIN_MFA_OBLIGATORIO === 'si';
}

/** Nivel de autenticación de la sesión actual según Supabase Auth: aal1 (contraseña) o aal2 (con segundo factor). */
export async function nivelAutenticacion(): Promise<'aal1' | 'aal2' | null> {
  const supabase = await clienteSesion();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data?.currentLevel) return null;
  return data.currentLevel === 'aal2' ? 'aal2' : 'aal1';
}

async function cumpleMfa(): Promise<boolean> {
  if (!mfaAdminObligatorio()) return true;
  return (await nivelAutenticacion()) === 'aal2';
}

/**
 * Páginas del panel: quien no es admin (con o sin sesión) recibe el mismo "no encontrado"
 * que una dirección inexistente, para no revelar que el panel existe.
 */
export async function exigirAdmin() {
  const usuario = await usuarioActual();
  if (!usuario || !(await esAdmin()) || !(await cumpleMfa())) notFound();
  return usuario;
}

/**
 * Acciones de servidor del panel. Cada acción la llama primero. Una denegación esperada no es un
 * error interno: responde el mismo "no encontrado" (404) que las páginas del panel, sin detalles.
 * La base de datos (RLS y funciones con es_admin()) vuelve a rechazar por su cuenta.
 */
export async function exigirAdminAccion() {
  const usuario = await usuarioActual();
  if (!usuario || !(await esAdmin()) || !(await cumpleMfa())) notFound();
  return usuario;
}
