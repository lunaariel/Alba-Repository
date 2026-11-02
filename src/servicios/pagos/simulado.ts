import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { EstadoPago, EventoPago, ProveedorPagos, SesionPago } from './tipos';

/**
 * Pasarela simulada para desarrollo y pruebas. Firma sus webhooks con HMAC-SHA256 igual que
 * lo haría una pasarela real, para ejercitar la verificación. Nunca mueve dinero.
 */
export class PagosSimulados implements ProveedorPagos {
  readonly nombre = 'simulado';
  private readonly pagos = new Map<string, { ordenId: string; estado: EstadoPago; montoCentavos: number }>();
  /** Simula que la pasarela no responde a las consultas (error de comunicación; la pasarela real reintentaría). */
  sinConexion = false;

  constructor(private readonly secreto: string, private readonly urlBase = 'http://localhost:3000') {
    if (secreto.length < 16) throw new Error('El secreto de la pasarela simulada debe tener al menos 16 caracteres.');
  }

  async crearSesion(datos: { ordenId: string; montoCentavos: number }): Promise<SesionPago> {
    const idExterno = `sim_${randomUUID()}`;
    this.pagos.set(idExterno, { ordenId: datos.ordenId, estado: 'pendiente', montoCentavos: datos.montoCentavos });
    return { idExterno, urlCheckout: `${this.urlBase}/pago-simulado?pago=${idExterno}` };
  }

  /**
   * Genera el webhook que la pasarela "enviaría" al cambiar de estado. Con `idEvento` repite un aviso ya enviado
   * (reintento de la pasarela); con `montoAviso` simula un aviso cuyo importe no coincide con el pago real.
   */
  generarWebhook(idExterno: string, estado: EstadoPago, opciones: { idEvento?: string; montoAviso?: number } = {}): { cuerpo: string; cabeceras: Record<string, string> } {
    const pago = this.pagos.get(idExterno);
    if (!pago) throw new Error(`Pago simulado inexistente: ${idExterno}`);
    pago.estado = estado;
    const cuerpo = JSON.stringify({
      id: opciones.idEvento ?? `evt_${randomUUID()}`,
      tipo: estado === 'reembolsado' ? 'reembolso' : estado === 'contracargo' ? 'contracargo' : 'pago',
      pago: idExterno,
      orden: pago.ordenId,
      estado,
      monto: opciones.montoAviso ?? pago.montoCentavos,
    });
    return { cuerpo, cabeceras: { 'x-firma-simulada': this.firmar(cuerpo) } };
  }

  async verificarEvento(cuerpoCrudo: string, cabeceras: Record<string, string | undefined>): Promise<EventoPago> {
    const firma = cabeceras['x-firma-simulada'] ?? '';
    const esperada = this.firmar(cuerpoCrudo);
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('firma_invalida');
    const d = JSON.parse(cuerpoCrudo) as {
      id: string; tipo: string; pago: string; orden: string; estado: EstadoPago; monto: number;
    };
    return {
      proveedor: this.nombre, idEvento: d.id, tipo: d.tipo, ordenId: d.orden,
      idPagoExterno: d.pago, estado: d.estado, montoCentavos: d.monto, cuerpo: d,
    };
  }

  async consultarEstado(idExterno: string) {
    if (this.sinConexion) throw new Error('pasarela_no_responde');
    const pago = this.pagos.get(idExterno);
    if (!pago) throw new Error(`Pago simulado inexistente: ${idExterno}`);
    return { estado: pago.estado, montoCentavos: pago.montoCentavos };
  }

  async reembolsar(idExterno: string) {
    await this.consultarEstado(idExterno);
    return { idReembolso: `sim_reemb_${randomUUID()}` };
  }

  private firmar(cuerpo: string): string {
    return createHmac('sha256', this.secreto).update(cuerpo).digest('hex');
  }
}
