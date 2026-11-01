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
