/**
 * Política de seguridad de contenidos (CSP). Se arma en el middleware en cada solicitud, con un nonce nuevo:
 * Next.js lo aplica a sus propios scripts y solo esos se ejecutan ('strict-dynamic'). Sin comodines ni
 * orígenes abiertos «por si acaso»: cada origen externo está justificado abajo. Una integración nueva
 * (pasarela de pago, analítica, otro reproductor) agrega su origen aquí, documentado en docs/csp.md.
 *
 * Modos (CSP_MODO): «aplicar» (predeterminado) bloquea; «observacion» solo informa (Report-Only) para un
 * primer despliegue. En los dos, las violaciones se envían a /api/csp.
 */

/** Reproductor de Bunny Stream: video de presentación pública y lecciones con token (src/servicios/video). */
export const ORIGENES_VIDEO = ['https://iframe.mediadelivery.net', 'https://player.mediadelivery.net'] as const;

export type ModoCsp = 'aplicar' | 'observacion';

export function modoCsp(valor: string | undefined): ModoCsp {
  return valor === 'observacion' ? 'observacion' : 'aplicar';
}

/** Origen (esquema + host + puerto) de una URL; vacío si no es válida. */
function origen(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
}

export function construirCsp(o: { nonce: string; desarrollo: boolean; supabaseUrl?: string; https?: boolean; videoSimulado?: boolean; enmarcable?: boolean }): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(o.nonce)) throw new Error('nonce inválido');
  const supabase = origen(o.supabaseUrl);
  const directivas: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Solo scripts con el nonce de esta respuesta (y los que ellos carguen). Sin 'unsafe-inline' y sin
    // 'unsafe-eval' en producción; en desarrollo Next lo necesita para recargar en caliente.
    'script-src': ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'", ...(o.desarrollo ? ["'unsafe-eval'"] : [])],
    // Estilos: hoja propia (Tailwind) y atributos style de React/Next. Un estilo inyectado no ejecuta código;
    // queda como riesgo residual documentado (docs/csp.md).
    'style-src': ["'self'", "'unsafe-inline'"],
    // data: para el código QR del segundo factor (SVG generado por Supabase Auth); blob: para vistas previas.
    'img-src': ["'self'", 'data:', 'blob:'],
    // Fuentes autoalojadas por next/font (sin pedidos a Google desde el navegador).
    'font-src': ["'self'"],
    // Subida de PDF del panel con URL firmada de Supabase Storage; en desarrollo, el WebSocket de Next.
    'connect-src': ["'self'", ...(supabase ? [supabase] : []), ...(o.desarrollo ? ['ws:', 'wss:'] : [])],
    'media-src': ["'self'"],
    // El reproductor simulado (solo desarrollo y pruebas) se sirve desde el propio sitio.
    'frame-src': [...ORIGENES_VIDEO, ...(o.videoSimulado ? ["'self'"] : [])],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    // Solo la página del reproductor simulado se deja enmarcar, y únicamente por el propio sitio.
    'frame-ancestors': [o.enmarcable ? "'self'" : "'none'"],
    'report-uri': ['/api/csp'],
  };
  const texto = Object.entries(directivas).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (o.https) texto.push('upgrade-insecure-requests');
  return texto.join('; ');
}

/** Nonce aleatorio de 128 bits (Web Crypto, disponible en el runtime del middleware). */
export function nuevoNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
