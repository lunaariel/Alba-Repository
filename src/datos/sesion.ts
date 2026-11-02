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
 * Política de segundo factor de la administradora. La fuente es la base (tabla politica_seguridad, que se
 * cambia solo por script con responsable): así la base y la aplicación aplican la misma regla. La variable
 * ADMIN_MFA_OBLIGATORIO=si la fuerza encendida en la aplicación aunque la base no lo esté (nunca la apaga).
 * Si la política no se puede leer, se asume encendida: ante la duda, se exige el segundo factor.
 */
export type PoliticaSeguridad = { mfaAdminObligatorio: boolean; reforzadaMinutos: number };

export async function politicaSeguridad(): Promise<PoliticaSeguridad> {
  const supabase = await clienteSesion();
  const { data, error } = await supabase.rpc('politica_seguridad_vigente');
  const p = (data ?? null) as { mfa_admin_obligatorio?: boolean; reforzada_minutos?: number } | null;
  const forzada = process.env.ADMIN_MFA_OBLIGATORIO === 'si';
  if (error || !p) return { mfaAdminObligatorio: true, reforzadaMinutos: 5 };
  return { mfaAdminObligatorio: forzada || p.mfa_admin_obligatorio === true, reforzadaMinutos: p.reforzada_minutos ?? 5 };
}

/** Nivel de autenticación de la sesión actual según Supabase Auth: aal1 (contraseña) o aal2 (con segundo factor). */
export async function nivelAutenticacion(): Promise<{ actual: 'aal1' | 'aal2' | null; siguiente: 'aal1' | 'aal2' | null }> {
  const supabase = await clienteSesion();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { actual: null, siguiente: null };
  const nivel = (v: string | null) => (v === 'aal2' ? 'aal2' : v === 'aal1' ? 'aal1' : null);
  return { actual: nivel(data.currentLevel), siguiente: nivel(data.nextLevel) };
}

/** Rol admin sin mirar el segundo factor (para saber a quién pedírselo). No da ningún permiso. */
export async function tieneRolAdmin(): Promise<boolean> {
  const supabase = await clienteSesion();
  const { data, error } = await supabase.rpc('tiene_rol_admin');
  return !error && data === true;
}

/**
 * Con la política encendida, la sesión tiene que tener nivel aal2. La base lo exige por su cuenta en
 * es_admin() (lee el nivel del token firmado), así que esAdmin() ya devuelve falso sin segundo factor; esta
 * comprobación lo hace explícito en la aplicación y cubre ADMIN_MFA_OBLIGATORIO.
 */
async function cumpleMfa(): Promise<boolean> {
  if (!(await politicaSeguridad()).mfaAdminObligatorio) return true;
  return (await nivelAutenticacion()).actual === 'aal2';
}

/**
 * Páginas del panel: quien no es admin (con o sin sesión) recibe el mismo "no encontrado"
 * que una dirección inexistente, para no revelar que el panel existe. Una admin sin el segundo factor que
 * exige la política va a verificarlo (o a activarlo) antes de ver el panel.
 */
export async function exigirAdmin() {
  const usuario = await usuarioActual();
  if (!usuario) notFound();
  if (!(await esAdmin()) || !(await cumpleMfa())) {
    // A quien ya tiene el rol se le pide el segundo factor (no revela nada: ya sabe que es admin).
    if (await tieneRolAdmin()) redirect('/segundo-factor?siguiente=/admin');
    notFound();
  }
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
