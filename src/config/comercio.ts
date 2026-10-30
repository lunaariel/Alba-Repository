/**
 * Interruptor de venta. Permanece apagado hasta la Fase 6, cuando la pasarela, la factura
 * electrónica y la política de reembolsos estén confirmadas y aprobadas por la titular.
 */
export const INSCRIPCIONES_ABIERTAS = false;

/** Biblioteca pública de Bunny Stream para los videos de presentación (no los de las lecciones). */
export const BIBLIOTECA_VIDEO_PUBLICA = process.env.NEXT_PUBLIC_BUNNY_BIBLIOTECA_PUBLICA ?? null;
