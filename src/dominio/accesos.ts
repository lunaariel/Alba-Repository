/**
 * Reglas puras de los períodos de acceso (compras, becas y concesiones). La base de datos aplica las
 * mismas reglas; aquí solo se preparan los datos del formulario y los textos.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Guatemala no tiene horario de verano: UTC−6 todo el año. */
const DESFASE_GUATEMALA = '-06:00';

/**
 * Convierte una fecha del formulario (AAAA-MM-DD, en hora de Guatemala) en un instante.
 * Inicio: comienzo de ese día. Fin: el acceso dura todo ese día (vence a las 23:59:59 de Guatemala), así la
 * fecha que se muestra es la misma que eligió la admin.
 */
export function instanteGuatemala(fecha: string, tipo: 'inicio' | 'fin'): string | null {
  if (!FECHA.test(fecha)) return null;
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const control = new Date(Date.UTC(a, m - 1, d));
  if (control.getUTCFullYear() !== a || control.getUTCMonth() !== m - 1 || control.getUTCDate() !== d) return null;  // 30 de febrero, mes 13…
  return new Date(`${fecha}T${tipo === 'fin' ? '23:59:59' : '00:00:00'}${DESFASE_GUATEMALA}`).toISOString();
}

export const ORIGENES_PERIODO = { compra: 'Compra', beca: 'Beca', concesion: 'Acceso otorgado' } as const;

/** Solo becas y concesiones se revocan desde el panel; una compra, únicamente con un reembolso confirmado. */
export function revocableDesdePanel(p: { origen: keyof typeof ORIGENES_PERIODO; estado: 'activo' | 'revocado' }): boolean {
  return p.estado === 'activo' && p.origen !== 'compra';
}

/** Días calendario de Guatemala que quedan hasta el último día con acceso (0 = termina hoy). */
export function diasRestantesGuatemala(fin: Date, ahora = new Date()): number {
  const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const ultimo = new Date(fin.getTime() - 1);
  return Math.round((Date.parse(dia(ultimo)) - Date.parse(dia(ahora))) / 86_400_000);
}

/**
 * Cómo se muestra el acceso de un curso vigente en el campus. `fin` es el fin de la cobertura continua (null: sin
 * vencimiento). Con 30 días o menos se destaca, igual que los avisos por correo.
 */
export function textoAccesoVigente(fin: Date | null, ahora = new Date()): { texto: string; fecha: Date | null; urgente: boolean } {
  if (!fin) return { texto: 'Acceso sin vencimiento', fecha: null, urgente: false };
  const dias = diasRestantesGuatemala(fin, ahora);
  if (dias <= 30) {
    const cuando = dias <= 0 ? 'termina hoy' : dias === 1 ? 'termina mañana' : `termina en ${dias} días`;
    return { texto: `Su acceso ${cuando}: hasta el`, fecha: new Date(fin.getTime() - 1), urgente: true };
  }
  return { texto: 'Acceso hasta el', fecha: new Date(fin.getTime() - 1), urgente: false };
}
