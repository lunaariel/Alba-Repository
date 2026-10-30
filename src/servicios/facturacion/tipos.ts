/**
 * Contrato de emisión de documentos. En Guatemala, la factura electrónica (FEL) se emite a través
 * de un certificador autorizado por la SAT, que se elige en la Fase 6. Mientras tanto solo se
 * emite un recibo comercial, que dice expresamente que no es un documento fiscal.
 */

export type TipoDocumento = 'recibo' | 'factura_fel';

export interface DatosDocumento {
  ordenId: string;
  fecha: Date;
  cliente: { nombre: string; correo: string; nit?: string | null };
  items: { descripcion: string; precioCentavos: number }[];
  totalCentavos: number;
}

export interface DocumentoEmitido {
  tipo: TipoDocumento;
  serie?: string;
  numero: string;
  certificador?: string;
  /** Contenido del documento (texto o PDF) a guardar en almacenamiento privado. */
  contenido: string;
}

export interface ProveedorFiscal {
  readonly tipo: TipoDocumento;
  emitir(datos: DatosDocumento): Promise<DocumentoEmitido>;
  anular(numero: string, motivo: string): Promise<void>;
}
