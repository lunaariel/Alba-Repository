/**
 * Validación de la configuración por entorno (Fase 6B, preparación local). Pura: recibe las variables y devuelve
 * errores y avisos que NOMBRAN variables, nunca muestran sus valores. La usan el arranque del servidor
 * (instrumentation.ts) y `npm run configuracion`.
 *
 * Entornos (APP_ENTORNO):
 *   desarrollo  computadora local; se admiten simuladores y valores de ejemplo.
 *   pruebas     CI o una copia efímera; se admiten simuladores; nunca datos ni credenciales reales.
 *   produccion  el sitio real; ningún simulador, todo secreto definido y distinto de los ejemplos, HTTPS.
 */

export type Entorno = 'desarrollo' | 'pruebas' | 'produccion';
export type Resultado = { entorno: Entorno; errores: string[]; avisos: string[] };
type Variables = Record<string, string | undefined>;

const EJEMPLO = /cambiar|ejemplo|solo-para|example|changeme|^x+$/i;
const URL_LOCAL = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i;

/** Secretos del servidor: obligatorios y largos en producción; nunca con prefijo NEXT_PUBLIC_. */
export const SECRETOS = ['SUPABASE_SERVICE_ROLE_KEY', 'PROCESOS_CLAVE', 'CONTACTO_SAL', 'BUNNY_CLAVE_TOKEN', 'PAGOS_SECRETO_SIMULADO',
  'VIDEO_SIMULADO_SECRETO'] as const;

export function entornoDe(v: Variables): Entorno {
  const e = v.APP_ENTORNO;
  return e === 'produccion' || e === 'pruebas' ? e : 'desarrollo';
}

/** Payload de un JWT (sin verificar: solo para detectar una clave de servicio pegada en el lugar equivocado). */
function rolJwt(token: string | undefined): string | null {
  try {
    const parte = (token ?? '').split('.')[1];
    if (!parte) return null;
    return (JSON.parse(Buffer.from(parte, 'base64url').toString()) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

export function validarConfiguracion(v: Variables): Resultado {
  const entorno = entornoDe(v);
  const errores: string[] = [];
  const avisos: string[] = [];
  const prod = entorno === 'produccion';
  const falta = (k: string) => !v[k] || v[k]!.trim() === '';

  if (v.APP_ENTORNO && !['desarrollo', 'pruebas', 'produccion'].includes(v.APP_ENTORNO)) errores.push('APP_ENTORNO: valor desconocido (use desarrollo, pruebas o produccion).');

  // Siempre obligatorias.
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_URL_SITIO', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (falta(k)) errores.push(`${k}: falta.`);
  }
  // Ningún secreto en variables públicas (llegan al navegador).
  for (const [k, valor] of Object.entries(v)) {
    if (!k.startsWith('NEXT_PUBLIC_') || !valor) continue;
    if (rolJwt(valor) === 'service_role' || /CLAVE|SECRET|TOKEN|PASSWORD|SAL$/i.test(k.replace('NEXT_PUBLIC_SUPABASE_ANON_KEY', ''))) {
      errores.push(`${k}: parece un secreto y las variables NEXT_PUBLIC_ llegan al navegador.`);
    }
  }
  if (rolJwt(v.NEXT_PUBLIC_SUPABASE_ANON_KEY) === 'service_role') errores.push('NEXT_PUBLIC_SUPABASE_ANON_KEY: es una clave de servicio; use la clave anónima.');
  if (v.SUPABASE_SERVICE_ROLE_KEY && v.SUPABASE_SERVICE_ROLE_KEY === v.NEXT_PUBLIC_SUPABASE_ANON_KEY) errores.push('SUPABASE_SERVICE_ROLE_KEY: es igual a la clave anónima.');

  // Proveedores.
  const video = v.VIDEO_PROVEEDOR ?? (v.BUNNY_BIBLIOTECA_PRIVADA && v.BUNNY_CLAVE_TOKEN ? 'bunny' : 'ninguno');
  if (!['bunny', 'simulado', 'ninguno'].includes(video)) errores.push('VIDEO_PROVEEDOR: valor desconocido (bunny, simulado o ninguno).');
  if (video === 'bunny' && (falta('BUNNY_BIBLIOTECA_PRIVADA') || falta('BUNNY_CLAVE_TOKEN'))) errores.push('VIDEO_PROVEEDOR=bunny: faltan BUNNY_BIBLIOTECA_PRIVADA o BUNNY_CLAVE_TOKEN.');
  if (video === 'simulado' && falta('VIDEO_SIMULADO_SECRETO')) errores.push('VIDEO_PROVEEDOR=simulado: falta VIDEO_SIMULADO_SECRETO.');
  const correo = v.CORREO_PROVEEDOR ?? 'simulado';
  if (!['simulado'].includes(correo)) errores.push('CORREO_PROVEEDOR: solo existe el simulado (el proveedor real no está contratado).');
  const pagos = v.PAGOS_PROVEEDOR ?? 'simulado';
  if (!['simulado'].includes(pagos)) errores.push('PAGOS_PROVEEDOR: solo existe el simulado (la pasarela no está elegida).');

  if (prod) {
    if (video !== 'bunny') errores.push('VIDEO_PROVEEDOR: en producción tiene que ser bunny (no simulado ni ninguno).');
    if (correo === 'simulado') errores.push('CORREO_PROVEEDOR: en producción no se admite el simulado.');
    if (pagos === 'simulado') errores.push('PAGOS_PROVEEDOR: en producción no se admite el simulado.');
    for (const k of ['PROCESOS_CLAVE', 'CONTACTO_SAL']) if (falta(k)) errores.push(`${k}: falta.`);
    for (const k of SECRETOS) {
      const valor = v[k];
      if (!valor) continue;
      if (EJEMPLO.test(valor)) errores.push(`${k}: tiene un valor de ejemplo.`);
      if (valor.length < 24 && k !== 'SUPABASE_SERVICE_ROLE_KEY') errores.push(`${k}: demasiado corta (mínimo 24 caracteres).`);
    }
    for (const k of ['NEXT_PUBLIC_URL_SITIO', 'NEXT_PUBLIC_SUPABASE_URL']) {
      const valor = v[k] ?? '';
      if (valor && !valor.startsWith('https://')) errores.push(`${k}: en producción tiene que usar https://.`);
      if (URL_LOCAL.test(valor.replace(/^https?:\/\//, ''))) errores.push(`${k}: apunta a una dirección local.`);
    }
    if (v.ADMIN_MFA_OBLIGATORIO && v.ADMIN_MFA_OBLIGATORIO !== 'si') avisos.push('ADMIN_MFA_OBLIGATORIO: solo «si» la fuerza; la política vive en la base.');
    if (v.CSP_MODO !== 'observacion') avisos.push('CSP_MODO: para el primer despliegue se recomienda «observacion».');
  } else {
    if (video === 'ninguno') avisos.push('Videos de lecciones: sin proveedor; el campus muestra «video pendiente».');
    if (correo === 'simulado') avisos.push('Correo: simulado; nada se envía y queda registrado como «simulado».');
    if (pagos === 'simulado') avisos.push('Pagos: simulados; no se procesa dinero.');
    if (v.PROCESOS_CLAVE && v.PROCESOS_CLAVE.length < 24) errores.push('PROCESOS_CLAVE: demasiado corta (mínimo 24 caracteres).');
  }
  return { entorno, errores, avisos };
}
