'use server';

import { redirect } from 'next/navigation';
import { clienteSesion } from '@/datos/supabase';
import { factoresTotp, verificarCodigo } from '@/datos/mfa';
import { nivelAutenticacion, politicaSeguridad, tieneRolAdmin, usuarioActual } from '@/datos/sesion';
import { ERRORES_MFA, normalizarCodigo } from '@/dominio/mfa';

export type EstadoMfa = { error?: string; ok?: string } | undefined;
export type EstadoActivacion = { error?: string; factorId?: string; qr?: string; secreto?: string } | undefined;

/** Solo rutas internas (igual que al ingresar). */
function destinoSeguro(valor: FormDataEntryValue | null, porDefecto: string): string {
  const s = typeof valor === 'string' ? valor : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : porDefecto;
}

/** Registro propio de la academia (además del de Supabase Auth). Nunca guarda códigos ni secretos. */
async function registrar(evento: 'segundo_factor_activado' | 'segundo_factor_quitado' | 'segundo_factor_verificado') {
  await (await clienteSesion()).rpc('registrar_evento_segundo_factor', { p_evento: evento });
}

/** Paso de ingreso: la persona ya puso su contraseña y ahora escribe el código de su app. */
export async function verificarIngreso(_: EstadoMfa, datos: FormData): Promise<EstadoMfa> {
  if (!(await usuarioActual())) redirect('/ingresar');
  const s = await clienteSesion();
  const r = await verificarCodigo(s, datos.get('codigo'));
  if (r === 'sin_segundo_factor') redirect('/segundo-factor/activar');
  if (r !== 'ok') return { error: r === 'codigo_reforzado_requerido' ? 'Escriba los 6 dígitos que muestra su app autenticadora.' : ERRORES_MFA.codigo_reforzado_invalido };
  await registrar('segundo_factor_verificado');
  redirect(destinoSeguro(datos.get('siguiente'), (await tieneRolAdmin()) ? '/admin' : '/campus'));
}

/**
 * Activación (solo cuentas con rol admin): Supabase Auth crea el factor y su secreto; se muestran una sola vez
 * (código QR y texto) para cargarlos en la app. Quedan sin efecto hasta confirmar con un código válido.
 */
export async function iniciarActivacion(_: EstadoActivacion): Promise<EstadoActivacion> {
  if (!(await usuarioActual()) || !(await tieneRolAdmin())) redirect('/ingresar');
  const s = await clienteSesion();
  const factores = await factoresTotp(s);
  const verificados = factores.filter((f) => f.verificado);
  if (verificados.length && (await nivelAutenticacion()).actual !== 'aal2') redirect('/segundo-factor?siguiente=/segundo-factor/activar');
  // Un intento anterior sin confirmar se descarta (no sirve para ingresar).
  for (const f of factores.filter((x) => !x.verificado)) await s.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await s.auth.mfa.enroll({
    factorType: 'totp', issuer: 'Albor', friendlyName: verificados.length ? `Respaldo ${verificados.length}` : 'Principal',
  });
  if (error || !data) return { error: 'No se pudo preparar el segundo factor. Intente de nuevo en unos minutos.' };
  return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
}

export async function confirmarActivacion(_: EstadoActivacion, datos: FormData): Promise<EstadoActivacion> {
  if (!(await usuarioActual()) || !(await tieneRolAdmin())) redirect('/ingresar');
  const factorId = String(datos.get('factorId') ?? '');
  const codigo = normalizarCodigo(datos.get('codigo'));
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) return { error: 'Vuelva a empezar la activación.' };
  if (!codigo) return { error: 'Escriba los 6 dígitos que muestra su app autenticadora.' };
  const s = await clienteSesion();
  const { error } = await s.auth.mfa.challengeAndVerify({ factorId, code: codigo });
  if (error) return { error: 'El código no coincide. Revise que la hora de su teléfono sea automática y escriba el código actual.' };
  await registrar('segundo_factor_activado');
  redirect(`/segundo-factor/activar?ok=1&siguiente=${encodeURIComponent(destinoSeguro(datos.get('siguiente'), '/admin'))}`);
}

/**
 * Quitar un factor: operación sensible (código actual, verificado ahora). Con la política encendida no se
 * puede quitar el único factor, para no dejar a la administradora fuera del panel por error.
 */
export async function quitarFactor(datos: FormData) {
  if (!(await usuarioActual()) || !(await tieneRolAdmin())) redirect('/ingresar');
  const volver = '/admin/configuracion';
  const factorId = String(datos.get('factorId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) redirect(`${volver}?error=invalido`);
  const s = await clienteSesion();
  const r = await verificarCodigo(s, datos.get('codigo_reforzado'));
  if (r !== 'ok') redirect(`${volver}?error=${r}`);
  const verificados = (await factoresTotp(s)).filter((f) => f.verificado);
  if ((await politicaSeguridad()).mfaAdminObligatorio && verificados.length <= 1) redirect(`${volver}?error=ultimo_factor`);
  const { error } = await s.auth.mfa.unenroll({ factorId });
  if (error) redirect(`${volver}?error=invalido`);
  await registrar('segundo_factor_quitado');
  redirect(`${volver}?ok=factor_quitado`);
}
