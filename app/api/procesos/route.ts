import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { clienteServicio } from '@/datos/supabase';

export const dynamic = 'force-dynamic';

/**
 * Procesos programados: vencer reservas de cupo, finalizar talleres terminados y registrar los
 * recordatorios que correspondan. Lo llamará la tarea programada del hosting (Vercel Cron o pg_cron),
 * que se elige al definir el hosting. Exige la clave PROCESOS_CLAVE; sin ella configurada, no corre.
 * Los recordatorios quedan registrados como pendientes: no hay proveedor de correo conectado.
 */
export async function POST(request: NextRequest) {
  const clave = process.env.PROCESOS_CLAVE;
  if (!clave || clave.length < 24) return new NextResponse('No configurado', { status: 503 });
  const recibida = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
  const esperada = Buffer.from(clave);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return new NextResponse('No autorizado', { status: 401 });
  const db = clienteServicio();
  const [reservas, finalizados, recordatorios] = [
    await db.rpc('vencer_reservas'), await db.rpc('finalizar_talleres'), await db.rpc('procesar_recordatorios', {}),
  ];
  const error = reservas.error ?? finalizados.error ?? recordatorios.error;
  if (error) return NextResponse.json({ error: 'fallo_proceso' }, { status: 500 });
  return NextResponse.json({ reservas_vencidas: reservas.data, talleres_finalizados: finalizados.data, recordatorios_registrados: recordatorios.data });
}
