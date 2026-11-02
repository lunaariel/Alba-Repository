import 'server-only';
import { VideoBunny } from './bunny';
import { VideoSimulado } from './simulado';
import type { ProveedorVideo } from './tipos';

/**
 * Proveedor de video según VIDEO_PROVEEDOR: bunny (requiere sus dos variables), simulado (solo fuera de producción)
 * o ninguno. Sin VIDEO_PROVEEDOR: bunny si están sus variables; si no, ninguno (el campus muestra «video pendiente»).
 * La configuración inválida la detecta src/config/validacion.ts al arrancar.
 */
export function proveedorVideo(): ProveedorVideo | null {
  const elegido = process.env.VIDEO_PROVEEDOR ?? (process.env.BUNNY_BIBLIOTECA_PRIVADA && process.env.BUNNY_CLAVE_TOKEN ? 'bunny' : 'ninguno');
  if (elegido === 'bunny' && process.env.BUNNY_BIBLIOTECA_PRIVADA && process.env.BUNNY_CLAVE_TOKEN) {
    return new VideoBunny(process.env.BUNNY_BIBLIOTECA_PRIVADA, process.env.BUNNY_CLAVE_TOKEN);
  }
  if (elegido === 'simulado' && process.env.APP_ENTORNO !== 'produccion' && process.env.VIDEO_SIMULADO_SECRETO) {
    return new VideoSimulado(process.env.VIDEO_SIMULADO_SECRETO, process.env.VIDEO_SIMULADO_FALLA === 'si');
  }
  return null;
}
