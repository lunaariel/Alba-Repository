/** Textos de estado y horarios de talleres, con zona horaria siempre explícita. */

export function textoCupo(cupo: number | null, ocupados: number, estado: string): string {
  if (estado === 'cancelado') return 'Cancelado';
  if (estado === 'finalizado') return 'Finalizado';
  if (cupo === null) return 'Lugares disponibles';
  const libres = Math.max(0, cupo - ocupados);
  if (libres === 0) return 'Cupo completo';
  return libres === 1 ? 'Queda 1 lugar' : `Quedan ${libres} lugares`;
}

/** Nombre corto de la zona horaria para mostrar ("hora de Guatemala"). */
const NOMBRES_ZONA: Record<string, string> = {
  'America/Guatemala': 'hora de Guatemala',
};

/**
 * "martes 10 de noviembre, 18:00 (hora de Guatemala)".
 * Si la persona está en otra zona, se agrega su hora local entre paréntesis.
 */
export function formatearHorario(inicio: Date, zonaTaller: string, zonaPersona?: string | null): string {
  const fmt = (zona: string) =>
    new Intl.DateTimeFormat('es-GT', {
      timeZone: zona,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(inicio);
  const hora = (zona: string) =>
    new Intl.DateTimeFormat('es-GT', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(inicio);

  const base = `${fmt(zonaTaller)} (${NOMBRES_ZONA[zonaTaller] ?? zonaTaller})`;
  if (!zonaPersona || zonaPersona === zonaTaller) return base;
  return `${base}; ${hora(zonaPersona)} en su zona horaria`;
}
