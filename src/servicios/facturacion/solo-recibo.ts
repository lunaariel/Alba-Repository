import { formatearUSD } from '../../dominio/dinero';
import type { DatosDocumento, DocumentoEmitido, ProveedorFiscal } from './tipos';

export const LEYENDA_NO_FISCAL = 'Este recibo comercial no es una factura ni un documento fiscal.';

/** Emite recibos comerciales. No reemplaza a la factura electrónica FEL. */
export class SoloRecibo implements ProveedorFiscal {
  readonly tipo = 'recibo' as const;

  constructor(private readonly nombreAcademia: string) {}

  async emitir(datos: DatosDocumento): Promise<DocumentoEmitido> {
    const suma = datos.items.reduce((t, i) => t + i.precioCentavos, 0);
    if (suma < datos.totalCentavos) throw new Error('El total no puede superar la suma de los ítems.');
    const numero = `R-${datos.ordenId.slice(0, 8).toUpperCase()}`;
    const lineas = [
      `${this.nombreAcademia} · Recibo ${numero}`,
      `Fecha: ${datos.fecha.toISOString().slice(0, 10)}`,
      `Cliente: ${datos.cliente.nombre} <${datos.cliente.correo}>`,
      ...datos.items.map((i) => `- ${i.descripcion}: ${formatearUSD(i.precioCentavos)}`),
      `Total pagado: ${formatearUSD(datos.totalCentavos)}`,
      LEYENDA_NO_FISCAL,
    ];
    return { tipo: 'recibo', numero, contenido: lineas.join('\n') };
  }

  async anular(): Promise<void> {
    // Un recibo comercial no se anula ante ninguna autoridad; el reembolso queda en la orden.
  }
}
