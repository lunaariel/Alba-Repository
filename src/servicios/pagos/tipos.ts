/**
 * Contrato de cualquier pasarela de pagos. La pasarela definitiva para Guatemala se elige en la Fase 6;
 * hasta entonces se usa el adaptador simulado. Ningún adaptador guarda datos de tarjetas.
 */

export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado' | 'reembolsado' | 'contracargo';

export interface SesionPago {
  /** Página oficial de la pasarela a la que se redirige a la persona. */
  urlCheckout: string;
  /** Identificador del pago en la pasarela. */
  idExterno: string;
}

/** Notificación ya verificada, lista para public.procesar_evento_pago. */
export interface EventoPago {
  proveedor: string;
  idEvento: string;
  tipo: string;
  ordenId: string;
  idPagoExterno: string;
  estado: EstadoPago;
  montoCentavos: number;
  cuerpo: unknown;
}

export interface ProveedorPagos {
  readonly nombre: string;
  crearSesion(datos: {
    ordenId: string;
    montoCentavos: number;
    descripcion: string;
    correo: string;
    urlRegreso: string;
  }): Promise<SesionPago>;
  /** Verifica la firma de un webhook. Si la firma no es válida, lanza un error y no se procesa nada. */
  verificarEvento(cuerpoCrudo: string, cabeceras: Record<string, string | undefined>): Promise<EventoPago>;
  /** Consulta el estado real en la pasarela, para no confiar solo en el webhook. */
  consultarEstado(idExterno: string): Promise<{ estado: EstadoPago; montoCentavos: number }>;
  reembolsar(idExterno: string, montoCentavos: number, motivo: string): Promise<{ idReembolso: string }>;
}
