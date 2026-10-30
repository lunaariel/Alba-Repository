/**
 * Contrato para entregar videos privados. El adaptador de Bunny Stream (URL firmada por token)
 * está en bunny.ts.
 * El servidor solo firma una URL después de comprobar que la persona tiene acceso al curso.
 */
export interface ProveedorVideo {
  readonly nombre: string;
  urlReproduccion(videoId: string, opciones: { segundosValidez: number }): Promise<string>;
}

/** Para desarrollo: devuelve una URL local que no expone ningún video real. */
export class VideoSimulado implements ProveedorVideo {
  readonly nombre = 'simulado';
  async urlReproduccion(videoId: string, { segundosValidez }: { segundosValidez: number }): Promise<string> {
    const vence = Math.floor(Date.now() / 1000) + segundosValidez;
    return `http://localhost:3000/video-simulado/${encodeURIComponent(videoId)}?vence=${vence}`;
  }
}
