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
 * Páginas del panel: quien no es admin (con o sin sesión) recibe el mismo "no encontrado"
 * que una dirección inexistente, para no revelar que el panel existe.
 */
export async function exigirAdmin() {
  const usuario = await usuarioActual();
  if (!usuario || !(await esAdmin())) notFound();
  return usuario;
}

/** Acciones de servidor del panel: rechazan sin dar detalles. Cada acción la llama primero. */
export async function exigirAdminAccion() {
  const usuario = await usuarioActual();
  if (!usuario || !(await esAdmin())) throw new Error('No autorizado.');
  return usuario;
}
