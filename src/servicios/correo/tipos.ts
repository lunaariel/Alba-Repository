/**
 * Contrato de correo transaccional. El adaptador real (Resend u otro) se conecta cuando haya
 * dominio. Los mensajes promocionales van por otro canal y requieren consentimiento.
 */

export type ClavePlantilla =
  | 'bienvenida'
  | 'recuperar_contrasena'
  | 'confirmacion_compra'
  | 'acceso_curso'
  | 'certificado_disponible'
  | 'inscripcion_taller'
  | 'recordatorio_taller'
  | 'taller_cancelado'
  | 'reembolso';

export interface MensajeCorreo {
  para: string;
  plantilla: ClavePlantilla;
  variables: Record<string, string>;
  /** Evita enviar dos veces el mismo mensaje (p. ej. confirmacion_compra:<orden_id>). */
  claveIdempotencia: string;
}

export interface ProveedorCorreo {
  enviar(mensaje: MensajeCorreo): Promise<{ idExterno: string }>;
}

/** En desarrollo, los correos se guardan en memoria para inspeccionarlos en pruebas. */
export class CorreoEnMemoria implements ProveedorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  async enviar(mensaje: MensajeCorreo) {
    if (this.enviados.some((m) => m.claveIdempotencia === mensaje.claveIdempotencia)) {
      return { idExterno: 'duplicado-ignorado' };
    }
    this.enviados.push(mensaje);
    return { idExterno: `mem_${this.enviados.length}` };
  }
}
