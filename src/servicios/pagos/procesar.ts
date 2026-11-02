import type { EventoPago, ProveedorPagos } from './tipos';

/**
 * Procesa un aviso (webhook) de la pasarela. Un aviso NUNCA alcanza por sí solo como prueba de pago:
 *   1. se verifica la firma (si no coincide: 401, nada se registra);
 *   2. se consulta el estado real a la pasarela (si no responde: 503 para que la pasarela reintente; nada se registra);
 *   3. estado e importe consultados tienen que coincidir con el aviso (si no: 409, nada se registra);
 *   4. recién entonces se registra en la base (procesar_evento_pago), que es idempotente por evento y por pago:
 *      un aviso repetido no duplica accesos ni períodos, y un aviso tardío queda como incidencia si no hay lugar.
 * Si la base falla, se responde 500 y la pasarela reintenta: repetir es seguro por la idempotencia.
 */
export type ResultadoAviso =
  | { http: 200; resultado: 'registrado'; evento: EventoPago; respuestaBase: unknown }
  | { http: 401; resultado: 'firma_invalida' }
  | { http: 409; resultado: 'no_coincide' }
  | { http: 503; resultado: 'pasarela_no_responde' }
  | { http: 500; resultado: 'base_no_disponible' }
  | { http: 400; resultado: 'aviso_invalido' };

export type Registrar = (e: EventoPago) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function procesarAvisoPago(proveedor: ProveedorPagos, cuerpoCrudo: string, cabeceras: Record<string, string | undefined>, registrar: Registrar): Promise<ResultadoAviso> {
  let evento: EventoPago;
  try {
    evento = await proveedor.verificarEvento(cuerpoCrudo, cabeceras);
  } catch (e) {
    return e instanceof Error && e.message === 'firma_invalida' ? { http: 401, resultado: 'firma_invalida' } : { http: 400, resultado: 'aviso_invalido' };
  }
  let real: { estado: string; montoCentavos: number };
  try {
    real = await proveedor.consultarEstado(evento.idPagoExterno);
  } catch {
    return { http: 503, resultado: 'pasarela_no_responde' };
  }
  if (real.estado !== evento.estado || real.montoCentavos !== evento.montoCentavos) return { http: 409, resultado: 'no_coincide' };
  const { data, error } = await registrar(evento);
  if (error) return { http: 500, resultado: 'base_no_disponible' };
  return { http: 200, resultado: 'registrado', evento, respuestaBase: data };
}

/** Registro real: public.procesar_evento_pago con la clave de servicio. */
export function registrarEnBase(db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Registrar {
  return (e) => db.rpc('procesar_evento_pago', {
    p_proveedor: e.proveedor, p_id_evento: e.idEvento, p_tipo: e.tipo, p_cuerpo: e.cuerpo, p_orden: e.ordenId,
    p_id_pago_externo: e.idPagoExterno, p_estado: e.estado, p_monto_centavos: e.montoCentavos,
  });
}
