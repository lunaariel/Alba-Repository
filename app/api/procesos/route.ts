import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { clienteServicio } from '@/datos/supabase';
import { proveedorCorreo } from '@/servicios/correo';
import { procesarCola } from '@/servicios/correo/procesar';

export const dynamic = 'force-dynamic';

/**
 * Procesos programados: vencer reservas de cupo, finalizar talleres terminados y registrar los
 * recordatorios que correspondan. Lo llamará la tarea programada del hosting (Vercel Cron o pg_cron),
 * que se elige al definir el hosting. Exige la clave PROCESOS_CLAVE; sin ella configurada, no corre.
 * Registra los avisos de vencimiento que correspondan hoy (30, 7 y 1 día antes, sobre la cobertura continua, en
 * días de Guatemala) y procesa la cola de correos con el proveedor configurado; hoy solo el simulado, que los deja
 * «simulado» (nunca «enviado»). La tarea programada que la llame una vez al día se configura con el hosting.
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
  const avisos = await db.rpc('encolar_avisos_vencimiento', {});
  const proveedor = proveedorCorreo();
  const correos = proveedor
    ? await procesarCola({
        rpc: (fn, args) => db.rpc(fn, args),
        plantillas: async () => new Map(((await db.from('plantillas_correo').select('clave, asunto, cuerpo')).data ?? [])
          .map((p: { clave: string; asunto: string; cuerpo: string }) => [p.clave, { asunto: p.asunto, cuerpo: p.cuerpo }])),
      }, proveedor).catch(() => ({ error: 'cola_no_disponible' }))
    : { sin_proveedor: true };
  return NextResponse.json({ reservas_vencidas: reservas.data, talleres_finalizados: finalizados.data, recordatorios_registrados: recordatorios.data,
    avisos_vencimiento: avisos.error ? { error: 'fallo_avisos' } : avisos.data, correos });
}
