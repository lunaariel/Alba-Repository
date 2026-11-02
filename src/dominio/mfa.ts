/**
 * Reglas puras del segundo factor (TOTP de Supabase Auth). Ningún algoritmo criptográfico propio: el código
 * lo genera la app autenticadora y lo verifica Supabase Auth. Aquí solo se normaliza la entrada y se leen
 * los datos ya verificados del token (nivel aal y momento de la última verificación del factor).
 */

/** Código de 6 dígitos tal como lo escribe la persona (admite espacios o un guion en el medio). */
export function normalizarCodigo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(limpio) ? limpio : null;
}

export type EntradaAmr = { method?: string; timestamp?: number };

/** Momento (segundos Unix) de la última verificación TOTP de la sesión, según el claim amr del token. */
export function ultimaVerificacionTotp(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const marcas = (amr as EntradaAmr[])
    .filter((e) => e && (e.method === 'totp' || e.method === 'mfa/totp') && typeof e.timestamp === 'number')
    .map((e) => e.timestamp as number);
  return marcas.length ? Math.max(...marcas) : null;
}

/**
 * ¿La verificación reforzada sigue vigente? La base lo vuelve a comprobar con el token firmado; esto solo
 * sirve para orientar a la persona en la interfaz. Se rechaza una marca futura (reloj manipulado).
 */
export function reforzadaVigente(amr: unknown, minutos: number, ahora = Date.now()): boolean {
  const ts = ultimaVerificacionTotp(amr);
  if (ts === null) return false;
  const edad = ahora / 1000 - ts;
  return edad <= minutos * 60 && edad >= -60;
}

/** Qué falta para entrar al panel, según el nivel de la sesión y la política. */
export function pasoSegundoFactor(opciones: {
  actual: 'aal1' | 'aal2' | null;
  siguiente: 'aal1' | 'aal2' | null;
  esAdmin: boolean;
  politicaActiva: boolean;
}): 'verificar' | 'activar' | null {
  // Quien ya registró un factor lo verifica al ingresar (alumna o admin), con o sin política.
  if (opciones.siguiente === 'aal2' && opciones.actual !== 'aal2') return 'verificar';
  if (opciones.esAdmin && opciones.politicaActiva && opciones.actual !== 'aal2') return 'activar';
  return null;
}

/** Errores del segundo factor: códigos cortos para llevar por la dirección y mensajes para la persona. */
export const ERRORES_MFA: Record<string, string> = {
  codigo_reforzado_requerido: 'Escriba el código de 6 dígitos de su app autenticadora para confirmar esta operación.',
  codigo_reforzado_invalido: 'El código no es válido o ya cambió. Escriba el código que muestra ahora su app autenticadora.',
  verificacion_reforzada_requerida: 'Esta operación necesita el código de su app autenticadora. Escríbalo y vuelva a confirmar.',
  verificacion_reforzada_usada: 'Esa verificación ya se usó para otra operación. Escriba el código nuevo de su app autenticadora.',
  sin_segundo_factor: 'Su cuenta no tiene un segundo factor activo. Actívelo en Configuración › Seguridad.',
  ultimo_factor: 'No se puede quitar el único segundo factor mientras la política lo exige. Agregue otro antes.',
};
