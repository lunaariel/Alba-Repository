/**
 * Contrato para crear reuniones de talleres. La integración automática (Zoom o Google Meet)
 * se elige y conecta en la Fase 6; el adaptador "manual" guarda un enlace cargado a mano.
 */

export interface Reunion {
  proveedor: 'zoom' | 'meet' | 'manual';
  idExterno: string | null;
  enlaceParticipante: string;
  /** Nunca se muestra a alumnos; la base de datos no les permite leerlo. */
  enlaceAnfitrion: string | null;
}

export interface ProveedorReuniones {
  readonly nombre: Reunion['proveedor'];
  crear(datos: { titulo: string; inicio: Date; fin: Date; zonaHoraria: string }): Promise<Reunion>;
  reprogramar(idExterno: string, datos: { inicio: Date; fin: Date }): Promise<void>;
  eliminar(idExterno: string): Promise<void>;
}
