import { createHash } from 'node:crypto';
import type { ProveedorVideo } from './tipos';

/**
 * Bunny Stream, biblioteca privada con "token authentication" del reproductor embebido.
 * Fórmula (documentación de Bunny, revisada el 30/10/2026):
 *   token = SHA256_HEX(clave_token + video_id + expires), expires en segundos UNIX.
 *   https://player.mediadelivery.net/embed/{biblioteca}/{video}?token=…&expires=…
 * Sin credenciales no se usa: el campus muestra el aviso de video pendiente.
 */
export class VideoBunny implements ProveedorVideo {
  readonly nombre = 'bunny';

  constructor(private readonly biblioteca: string, private readonly claveToken: string) {}

  async urlReproduccion(videoId: string, { segundosValidez }: { segundosValidez: number }): Promise<string> {
    if (!/^[0-9a-f-]{36}$/i.test(videoId)) throw new Error('Identificador de video inválido.');
    const expires = Math.floor(Date.now() / 1000) + segundosValidez;
    const token = createHash('sha256').update(this.claveToken + videoId + expires).digest('hex');
    const url = new URL(`https://player.mediadelivery.net/embed/${encodeURIComponent(this.biblioteca)}/${videoId}`);
    url.searchParams.set('token', token);
    url.searchParams.set('expires', String(expires));
    return url.toString();
  }
}
