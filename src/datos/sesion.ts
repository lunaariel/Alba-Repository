import 'server-only';
import { redirect } from 'next/navigation';
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

export async function exigirAdmin() {
  const usuario = await exigirSesion('/admin');
  if (!(await esAdmin())) redirect('/campus');
  return usuario;
}
