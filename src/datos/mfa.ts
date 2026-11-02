import 'server-only';
import { clienteSesion } from './supabase';
import { politicaSeguridad } from './sesion';
import { normalizarCodigo } from '@/dominio/mfa';

type Cliente = Awaited<ReturnType<typeof clienteSesion>>;

/**
 * Segundo factor con Supabase Auth (TOTP). El secreto lo genera y lo guarda Supabase Auth en su propio
 * esquema (auth.mfa_factors), nunca en tablas de la aplicación; la aplicación solo lo muestra una vez, al
 * activarlo, para que la persona lo cargue en su app. Ningún código ni secreto se registra en los logs.
 */

export type Factor = { id: string; nombre: string; creado: string; verificado: boolean };

export async function factoresTotp(s?: Cliente): Promise<Factor[]> {
  const cliente = s ?? (await clienteSesion());
  const { data, error } = await cliente.auth.mfa.listFactors();
  if (error || !data) return [];
  return (data.all ?? [])
    .filter((f) => f.factor_type === 'totp')
    .map((f) => ({ id: f.id, nombre: f.friendly_name ?? 'App autenticadora', creado: f.created_at, verificado: f.status === 'verified' }));
}

/**
 * Verifica un código contra los factores verificados de la sesión. Si es válido, Supabase Auth emite un token
 * nuevo (aal2, con la hora de esta verificación en el claim amr) y el mismo cliente lo usa desde ahí.
 * Prueba como máximo los factores verificados de la cuenta (principal y respaldo).
 */
export async function verificarCodigo(s: Cliente, valor: unknown): Promise<'ok' | 'codigo_reforzado_requerido' | 'codigo_reforzado_invalido' | 'sin_segundo_factor'> {
  const codigo = normalizarCodigo(valor);
  if (!codigo) return 'codigo_reforzado_requerido';
  const factores = (await factoresTotp(s)).filter((f) => f.verificado);
  if (!factores.length) return 'sin_segundo_factor';
  for (const f of factores) {
    const { error } = await s.auth.mfa.challengeAndVerify({ factorId: f.id, code: codigo });
    if (!error) return 'ok';
  }
  return 'codigo_reforzado_invalido';
}

/**
 * Operaciones sensibles del panel. Con la política encendida, exige el código actual de la app autenticadora
 * (campo `codigo_reforzado` del formulario) y devuelve el cliente con el token recién verificado: la base
 * comprueba en la misma operación que la verificación es reciente y de un solo uso (0026). Con la política
 * apagada, devuelve el cliente de la sesión sin pedir nada (comportamiento anterior).
 */
export async function clienteOperacionSensible(datos: FormData): Promise<{ s: Cliente; error?: undefined } | { s?: undefined; error: string }> {
  const s = await clienteSesion();
  if (!(await politicaSeguridad()).mfaAdminObligatorio) return { s };
  const r = await verificarCodigo(s, datos.get('codigo_reforzado'));
  return r === 'ok' ? { s } : { error: r };
}
