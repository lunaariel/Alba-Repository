import { formatearHorario } from '@/dominio/talleres';
import { mensajeErrorTaller, mensajeOkTaller } from '@/dominio/talleres-admin';
import { EstadoChip } from './estructura';
import type { EstadoTaller } from '@/datos/admin-talleres';

export const TEXTOS_TALLER = { ok: mensajeOkTaller, error: mensajeErrorTaller };

const CHIP: Record<EstadoTaller, { estado: 'borrador' | 'publicado' | 'archivado' | 'pendiente' | 'error'; texto: string }> = {
  borrador: { estado: 'borrador', texto: 'Borrador' },
  publicado: { estado: 'publicado', texto: 'Publicado' },
  cancelado: { estado: 'error', texto: 'Cancelado' },
  finalizado: { estado: 'archivado', texto: 'Finalizado' },
  archivado: { estado: 'archivado', texto: 'Archivado' },
};
export function EstadoTallerChip({ estado }: { estado: EstadoTaller }) {
  return <EstadoChip estado={CHIP[estado].estado} texto={CHIP[estado].texto} />;
}

/** Fecha grande para las filas de la lista: día y mes en la zona del taller. */
export function FechaGrande({ inicio, zona }: { inicio: Date; zona: string }) {
  const dia = new Intl.DateTimeFormat('es-GT', { timeZone: zona, day: 'numeric' }).format(inicio);
  const mes = new Intl.DateTimeFormat('es-GT', { timeZone: zona, month: 'short' }).format(inicio).replace('.', '');
  return (
    <div aria-hidden="true" className="flex h-[64px] w-[64px] shrink-0 flex-col items-center justify-center rounded-xl bg-arena leading-none">
      <span className="font-display text-[26px] font-semibold">{dia}</span>
      <span className="mt-1 text-[13px] uppercase tracking-wide text-tinta-suave">{mes}</span>
    </div>
  );
}

export const horarioTaller = (inicio: Date, zona: string) => formatearHorario(inicio, zona);

export const lugares = (cupo: number | null, ocupados: number) =>
  cupo === null ? `${ocupados} ${ocupados === 1 ? 'inscripto' : 'inscriptos'} · sin límite de lugares` : `${ocupados} de ${cupo} lugares`;
