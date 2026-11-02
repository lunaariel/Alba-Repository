/**
 * Contrato para entregar videos privados. El servidor pide una URL de reproducción SOLO después de que la base
 * autorizó la lección (autorizar_video_leccion: acceso vigente, versión académica y bloqueo). La URL es temporal.
 * Adaptadores: Bunny Stream (bunny.ts, URL firmada por token) y el simulador local (simulado.ts).
 */
export interface ProveedorVideo {
  readonly nombre: 'bunny' | 'simulado';
  urlReproduccion(videoId: string, opciones: { segundosValidez: number }): Promise<string>;
}

/** Lo que el campus puede mostrar en lugar del video, sin detalles internos. */
export type EstadoVideo =
  | { estado: 'listo'; url: string }
  | { estado: 'pendiente' }          // la lección no tiene video cargado
  | { estado: 'no_disponible' }      // sin proveedor configurado en este entorno
  | { estado: 'error' };             // el proveedor falló: se puede reintentar

/** Segundos de validez de una URL de reproducción de lección (después hay que recargar la página). */
export const VALIDEZ_LECCION_SEGUNDOS = 2 * 60 * 60;
