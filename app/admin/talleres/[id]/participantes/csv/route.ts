import { NextResponse } from 'next/server';
import { tallerAdmin } from '@/datos/admin-talleres';
import { clienteSesion } from '@/datos/supabase';

export const dynamic = 'force-dynamic';

/** Lista de inscriptos en CSV. Solo la admin (tallerAdmin exige el rol); la exportación queda registrada. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await tallerAdmin((await params).id);
  if (!t) return new NextResponse('No encontrado', { status: 404 });
  const celda = (v: string) => `"${v.replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
  const filas = [['Nombre', 'Correo', 'Estado', 'Origen', 'Inscripción', 'Asistencia'],
    ...t.inscripciones.map((i) => [i.nombre, i.correo ?? '', i.estado, i.origen, i.creadoEn.toISOString(),
      i.asistio === null ? '' : i.asistio ? 'asistió' : 'no asistió'])];
  await (await clienteSesion()).rpc('registrar_actividad', {
    p_accion: 'inscriptos_exportados', p_entidad: 'talleres', p_entidad_id: t.id, p_detalle: { cantidad: t.inscripciones.length },
  });
  return new NextResponse('﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="inscriptos-${t.slug}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
