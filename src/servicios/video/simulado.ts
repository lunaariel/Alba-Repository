import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProveedorVideo } from './tipos';

/**
 * Simulador de video para desarrollo y pruebas (nunca en producción): misma forma que Bunny (URL con vencimiento y
 * firma HMAC-SHA256 de una clave del servidor), pero apunta a /video-simulado, que no tiene ningún video real.
 * Sirve para probar enlaces temporales, manipulación y vencimiento.
 */
export function firmaVideoSimulado(secreto: string, videoId: string, vence: number): string {
  return createHmac('sha256', secreto).update(`${videoId}:${vence}`).digest('hex');
}

export function verificarVideoSimulado(secreto: string, videoId: string, vence: string | null, firma: string | null, ahora = Date.now()):
  'valido' | 'firma_invalida' | 'vencido' {
  if (!vence || !firma || !/^\d{9,12}$/.test(vence) || !/^[0-9a-f]{64}$/.test(firma)) return 'firma_invalida';
  const esperada = Buffer.from(firmaVideoSimulado(secreto, videoId, Number(vence)));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return 'firma_invalida';
  return Number(vence) * 1000 < ahora ? 'vencido' : 'valido';
}

export class VideoSimulado implements ProveedorVideo {
  readonly nombre = 'simulado';
  constructor(private readonly secreto: string, private readonly falla = false) {
    if (secreto.length < 16) throw new Error('VIDEO_SIMULADO_SECRETO debe tener al menos 16 caracteres.');
  }
  async urlReproduccion(videoId: string, { segundosValidez }: { segundosValidez: number }): Promise<string> {
    if (this.falla) throw new Error('proveedor_video_no_disponible');
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(videoId)) throw new Error('Identificador de video inválido.');
    const vence = Math.floor(Date.now() / 1000) + segundosValidez;
    return `/video-simulado/${encodeURIComponent(videoId)}?vence=${vence}&firma=${firmaVideoSimulado(this.secreto, videoId, vence)}`;
  }
}
