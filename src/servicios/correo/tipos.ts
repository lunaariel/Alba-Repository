/**
 * Contrato de correo transaccional. El proveedor real (Resend, Postmark u otro) se conecta cuando haya dominio y
 * autorización; hasta entonces solo existe el simulado. Los mensajes promocionales van por otro canal y requieren
 * consentimiento. La confirmación de cuenta y la recuperación de contraseña las envía Supabase Auth.
 */

export type ClavePlantilla =
  | 'confirmacion_compra'
  | 'aviso_vencimiento'
  | 'comunicacion_importante'
  | 'recordatorio_taller';

export interface MensajeCorreo {
  para: string;
  asunto: string;
  texto: string;
  /** Evita enviar dos veces el mismo mensaje (p. ej. confirmacion_compra:<orden_id>). */
  claveIdempotencia: string;
}

export interface ProveedorCorreo {
  readonly nombre: string;
  /** true: no envía nada (simulador). La cola lo registra como «simulado», nunca como «enviado». */
  readonly simulado: boolean;
  enviar(mensaje: MensajeCorreo): Promise<{ idExterno: string }>;
}

/** Simulador: guarda los mensajes en memoria (para inspeccionarlos en pruebas). No sale nada de la computadora. */
export class CorreoSimulado implements ProveedorCorreo {
  readonly nombre = 'simulado';
  readonly simulado = true;
  readonly mensajes: MensajeCorreo[] = [];
  constructor(private readonly fallar: (m: MensajeCorreo) => boolean = () => false) {}
  async enviar(mensaje: MensajeCorreo) {
    if (this.fallar(mensaje)) throw new Error('proveedor_no_disponible');
    if (!this.mensajes.some((m) => m.claveIdempotencia === mensaje.claveIdempotencia)) this.mensajes.push(mensaje);
    return { idExterno: `sim_${this.mensajes.length}` };
  }
}
