/**
 * Reglas de progreso y certificado para mostrar en la interfaz.
 * La decisión final siempre la toma la base de datos (emitir_certificado);
 * estas funciones solo explican al alumno qué le falta.
 */

export interface LeccionConProgreso {
  id: string;
  orden: number;
  moduloOrden: number;
  completada: boolean;
  ultimaVisita?: Date | null;
}

export function porcentajeAvance(lecciones: LeccionConProgreso[]): number {
  if (lecciones.length === 0) return 0;
  const hechas = lecciones.filter((l) => l.completada).length;
  return Math.round((100 * hechas) / lecciones.length);
}

/** Lección para el botón "Continuar": la última visitada sin completar, o la primera pendiente. */
export function leccionParaContinuar(lecciones: LeccionConProgreso[]): LeccionConProgreso | null {
  const ordenadas = [...lecciones].sort((a, b) => a.moduloOrden - b.moduloOrden || a.orden - b.orden);
  const visitadasPendientes = ordenadas
    .filter((l) => !l.completada && l.ultimaVisita)
    .sort((a, b) => (b.ultimaVisita!.getTime() - a.ultimaVisita!.getTime()));
  return visitadasPendientes[0] ?? ordenadas.find((l) => !l.completada) ?? null;
}

export type MotivoCertificado = 'sin_acceso' | 'lecciones_pendientes' | 'evaluacion_no_aprobada';

export function estadoCertificado(datos: {
  accesoActivo: boolean;
  leccionesPendientes: number;
  evaluacionAprobada: boolean;
}): { disponible: true } | { disponible: false; motivo: MotivoCertificado; mensaje: string } {
  if (!datos.accesoActivo) {
    return { disponible: false, motivo: 'sin_acceso', mensaje: 'Necesita tener acceso al curso.' };
  }
  if (datos.leccionesPendientes > 0) {
    const n = datos.leccionesPendientes;
    return {
      disponible: false,
      motivo: 'lecciones_pendientes',
      mensaje: n === 1 ? 'Le falta completar 1 lección.' : `Le faltan completar ${n} lecciones.`,
    };
  }
  if (!datos.evaluacionAprobada) {
    return { disponible: false, motivo: 'evaluacion_no_aprobada', mensaje: 'Le falta aprobar la evaluación final.' };
  }
  return { disponible: true };
}
