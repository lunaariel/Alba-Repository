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
export function nombreZona(zona: string): string {
  return NOMBRES_ZONA[zona] ?? `hora de ${zona.split('/').pop()!.replace(/_/g, ' ')}`;
}

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

  const base = `${fmt(zonaTaller)} (${nombreZona(zonaTaller)})`;
  if (!zonaPersona || zonaPersona === zonaTaller) return base;
  return `${base}; ${hora(zonaPersona)} en su zona horaria`;
}

/** Zonas que la maestra puede elegir para un taller (la hora se escribe siempre en la zona del taller). */
export const ZONAS_TALLER = [
  { valor: 'America/Guatemala', texto: 'Guatemala' },
  { valor: 'America/Mexico_City', texto: 'Ciudad de México' },
  { valor: 'America/Bogota', texto: 'Bogotá' },
  { valor: 'America/Lima', texto: 'Lima' },
  { valor: 'America/Santiago', texto: 'Santiago de Chile' },
  { valor: 'America/Argentina/Buenos_Aires', texto: 'Buenos Aires' },
  { valor: 'America/New_York', texto: 'Nueva York' },
  { valor: 'Europe/Madrid', texto: 'Madrid' },
] as const;

const NOMBRES_EXTRA: Record<string, string> = {
  'America/Mexico_City': 'hora de Ciudad de México', 'America/Bogota': 'hora de Bogotá', 'America/Lima': 'hora de Lima',
  'America/Santiago': 'hora de Santiago de Chile', 'America/Argentina/Buenos_Aires': 'hora de Buenos Aires',
  'America/New_York': 'hora de Nueva York', 'Europe/Madrid': 'hora de Madrid',
};
for (const [z, n] of Object.entries(NOMBRES_EXTRA)) NOMBRES_ZONA[z] = n;

function desfaseMinutos(instante: number, zona: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((comoUtc - instante) / 60000);
}

/** Fecha y hora escritas en la zona del taller → instante absoluto. null si no existe (salto de horario de verano) o es inválida. */
export function instanteEnZona(fecha: string, hora: string, zona: string): Date | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha); const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!f || !h) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zona }); } catch { return null; }
  const local = Date.UTC(Number(f[1]), Number(f[2]) - 1, Number(f[3]), Number(h[1]), Number(h[2]));
  let instante = local - desfaseMinutos(local, zona) * 60000;
  instante = local - desfaseMinutos(instante, zona) * 60000;
  const p = partesEnZona(new Date(instante), zona);
  return p.fecha === fecha && p.hora === hora ? new Date(instante) : null;
}

/** Instante → fecha (AAAA-MM-DD) y hora (HH:MM) en la zona dada, para los campos del formulario. */
export function partesEnZona(instante: Date, zona: string): { fecha: string; hora: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instante).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

/** «Se verá como: lunes 9 de noviembre, 18:00 (hora de Guatemala) · 19:00 en Bogotá · 21:00 en Buenos Aires». */
export function vistaPreviaHorario(inicio: Date, zonaTaller: string): string {
  const hora = (zona: string) => new Intl.DateTimeFormat('es-GT', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(inicio);
  const otras = ['America/Guatemala', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'Europe/Madrid'].filter((z) => z !== zonaTaller)
    .map((z) => `${hora(z)} en ${nombreZona(z).replace(/^hora de /, '')}`);
  return [formatearHorario(inicio, zonaTaller), ...otras].join(' · ');
}

/** Estados de una inscripción, en palabras para la alumna y para el panel. */
export const ESTADOS_INSCRIPCION: Record<string, string> = {
  confirmada: 'Confirmada', cancelada: 'Cancelada', reembolsada: 'Reembolsada', reembolso_pendiente: 'Reembolso pendiente',
};
