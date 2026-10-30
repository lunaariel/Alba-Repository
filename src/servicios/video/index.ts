import 'server-only';
import { VideoBunny } from './bunny';
import { VideoSimulado, type ProveedorVideo } from './tipos';

/** Bunny si están las dos variables; si no, el simulado (el campus muestra "video pendiente"). */
export function proveedorVideo(): ProveedorVideo {
  const biblioteca = process.env.BUNNY_BIBLIOTECA_PRIVADA;
  const clave = process.env.BUNNY_CLAVE_TOKEN;
  return biblioteca && clave ? new VideoBunny(biblioteca, clave) : new VideoSimulado();
}
