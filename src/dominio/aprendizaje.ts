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

/** Lecciones en el orden del curso: por módulo y, dentro de cada uno, por orden. */
export function ordenarLecciones<T extends { orden: number; moduloOrden: number }>(lecciones: T[]): T[] {
  return [...lecciones].sort((a, b) => a.moduloOrden - b.moduloOrden || a.orden - b.orden);
}

/** Anterior y siguiente para navegar entre lecciones, cruzando módulos. */
export function vecinas<T extends { id: string; orden: number; moduloOrden: number }>(
  lecciones: T[],
  actualId: string,
): { anterior: T | null; siguiente: T | null; posicion: number; total: number } {
  const lista = ordenarLecciones(lecciones);
  const i = lista.findIndex((l) => l.id === actualId);
  if (i < 0) return { anterior: null, siguiente: null, posicion: 0, total: lista.length };
  return { anterior: lista[i - 1] ?? null, siguiente: lista[i + 1] ?? null, posicion: i + 1, total: lista.length };
}

/** Texto del avance para lectores de pantalla y para la tarjeta del curso. */
export function textoAvance(hechas: number, total: number): string {
  if (total === 0) return 'Este curso todavía no tiene lecciones.';
  if (hechas === 0) return `${total === 1 ? '1 lección' : `${total} lecciones`} por delante`;
  if (hechas === total) return 'Completó todas las lecciones';
  return `${hechas} de ${total} lecciones completadas`;
}

/**
 * Respuestas del formulario de evaluación → {"<pregunta>": ["<opción>", ...]}.
 * Los campos se llaman "p:<pregunta_id>"; cualquier otro campo se ignora.
 * La validez de cada opción la decide la base de datos al corregir.
 */
export function respuestasDesdeFormulario(entradas: Iterable<[string, unknown]>): Record<string, string[]> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const r: Record<string, string[]> = {};
  for (const [clave, valor] of entradas) {
    if (!clave.startsWith('p:') || typeof valor !== 'string') continue;
    const pregunta = clave.slice(2);
    if (!uuid.test(pregunta) || !uuid.test(valor)) continue;
    const lista = (r[pregunta] ??= []);
    if (!lista.includes(valor) && lista.length < 20) lista.push(valor);
  }
  return r;
}
