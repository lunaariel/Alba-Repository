import 'server-only';
import { CorreoSimulado, type ProveedorCorreo } from './tipos';

/** Hoy solo existe el simulado; la validación de configuración impide usarlo en producción. */
export function proveedorCorreo(): ProveedorCorreo | null {
  if ((process.env.CORREO_PROVEEDOR ?? 'simulado') === 'simulado' && process.env.APP_ENTORNO !== 'produccion') return new CorreoSimulado();
  return null;
}
