'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import { clienteServicio } from '@/datos/supabase';

export type EstadoContacto = { error?: string; campo?: string; ok?: boolean } | undefined;

const MAXIMO_POR_HORA = 5;

const esquema = z.object({
  nombre: z.string().trim().min(2, 'Escriba su nombre.').max(120),
  correo: z.string().trim().toLowerCase().email('Escriba un correo electrónico válido.'),
  mensaje: z.string().trim().min(5, 'Escriba su mensaje.').max(5000, 'El mensaje es demasiado largo.'),
});

export async function enviarMensaje(_: EstadoContacto, datos: FormData): Promise<EstadoContacto> {
  // Campo trampa: las personas no lo ven; los robots lo completan. Se responde como si todo saliera bien.
  if (String(datos.get('sitio_web') ?? '') !== '') return { ok: true };

  const r = esquema.safeParse({ nombre: datos.get('nombre'), correo: datos.get('correo'), mensaje: datos.get('mensaje') });
  if (!r.success) return { error: r.error.issues[0]?.message, campo: String(r.error.issues[0]?.path[0]) };

  // Límite por origen, guardando solo un hash de la IP (nunca la IP).
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'desconocida';
  const ipHash = createHash('sha256').update(`${process.env.CONTACTO_SAL ?? 'albor'}:${ip}`).digest('hex');

  const db = clienteServicio();
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db.from('mensajes_contacto').select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).gte('creado_en', haceUnaHora);
  if ((count ?? 0) >= MAXIMO_POR_HORA) {
    return { error: 'Recibimos varios mensajes seguidos desde su conexión. Intente de nuevo en una hora o escríbanos por correo.' };
  }

  const { error } = await db.from('mensajes_contacto').insert({ ...r.data, ip_hash: ipHash });
  if (error) return { error: 'No pudimos enviar su mensaje. Intente de nuevo en unos minutos.' };
  return { ok: true };
}
