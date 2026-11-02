import { completarPlantilla } from './plantillas';
import type { ProveedorCorreo } from './tipos';

/** Lo mínimo del cliente de Supabase (clave de servicio) que usa el procesador; facilita probarlo. */
export interface BaseCorreo {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  plantillas(): Promise<Map<string, { asunto: string; cuerpo: string }>>;
}

type Fila = { id: string; plantilla_clave: string; destinatario: string; clave_idempotencia: string; variables: Record<string, unknown> };

/**
 * Procesa un lote de la cola (envios_correo): recupera los trabados, toma hasta `limite`, arma cada mensaje y lo
 * entrega al proveedor. Registra «simulado» si el proveedor es el simulador, «enviado» solo con un proveedor real, y
 * un error (que la base reintenta con espera creciente) si algo falla. Los errores guardados no incluyen variables
 * ni destinatarios: solo un código.
 */
export async function procesarCola(db: BaseCorreo, proveedor: ProveedorCorreo, limite = 20) {
  await db.rpc('recuperar_correos_trabados');
  const { data, error } = await db.rpc('tomar_correos', { p_limite: limite });
  if (error) throw new Error('cola_no_disponible');
  const filas = (data ?? []) as Fila[];
  const plantillas = filas.length ? await db.plantillas() : new Map();
  const resumen = { procesados: 0, simulados: 0, enviados: 0, errores: 0 };
  for (const f of filas) {
    resumen.procesados++;
    let resultado: 'enviado' | 'simulado' | 'error' = 'error';
    let idExterno: string | null = null;
    let codigoError: string | null = null;
    try {
      const p = plantillas.get(f.plantilla_clave);
      if (!p) throw new Error('plantilla_inexistente');
      const mensaje = {
        para: f.destinatario, claveIdempotencia: f.clave_idempotencia,
        asunto: completarPlantilla(p.asunto, f.variables ?? {}), texto: completarPlantilla(p.cuerpo, f.variables ?? {}),
      };
      idExterno = (await proveedor.enviar(mensaje)).idExterno;
      resultado = proveedor.simulado ? 'simulado' : 'enviado';
    } catch (e) {
      // Solo el código (antes de «:»): nunca el texto del correo ni datos de la persona.
      codigoError = (e instanceof Error ? e.message : 'error').split(/[:\s]/)[0]!.slice(0, 60);
    }
    await db.rpc('registrar_envio_correo', { p_id: f.id, p_resultado: resultado, p_proveedor: proveedor.nombre, p_id_externo: idExterno, p_error: codigoError });
    if (resultado === 'error') resumen.errores++;
    else if (resultado === 'simulado') resumen.simulados++;
    else resumen.enviados++;
  }
  return resumen;
}
