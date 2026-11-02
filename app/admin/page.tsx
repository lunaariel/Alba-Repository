import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirAdmin } from '@/datos/sesion';
import { clienteSesion } from '@/datos/supabase';
import { alumnosPanel } from '@/datos/admin-consultas';
import { CabeceraAdmin } from '@/ui/admin/estructura';

export const metadata: Metadata = { title: 'Hoy' };

/**
 * Lo que pide atención, con enlaces. Solo lectura. Verificación propia además del layout: el contenido no viaja en
 * la respuesta 404 a quien no es admin.
 */
export default async function Hoy() {
  await exigirAdmin();
  const s = await clienteSesion();
  const [incidencias, borradores, fallidos, vencenPronto] = await Promise.all([
    s.from('incidencias').select('id', { count: 'exact', head: true }).neq('estado', 'resuelta'),
    s.from('cursos').select('id', { count: 'exact', head: true }).eq('estado', 'borrador'),
    s.from('envios_correo').select('id', { count: 'exact', head: true }).eq('estado', 'fallido'),
    alumnosPanel('', 'vencen_pronto'),
  ]);
  const tarjetas = [
    { n: incidencias.count ?? 0, titulo: 'Incidencias sin resolver', detalle: 'Pagos o accesos que necesitan su revisión.', href: '/admin/talleres/incidencias', accion: 'Ver incidencias' },
    { n: vencenPronto.length, titulo: 'Alumnos con acceso que vence en 30 días', detalle: 'Reciben avisos automáticos a 30, 7 y 1 día (hoy simulados: no sale ningún correo).', href: '/admin/alumnos?filtro=vencen_pronto', accion: 'Ver alumnos' },
    { n: borradores.count ?? 0, titulo: 'Cursos en borrador', detalle: 'Todavía no se ven en el sitio.', href: '/admin/cursos', accion: 'Ver cursos' },
    { n: fallidos.count ?? 0, titulo: 'Correos con error', detalle: 'No se pudieron entregar después de varios intentos.', href: '/admin/configuracion/actividad', accion: 'Ver registro de actividad' },
  ];
  return (
    <>
      <CabeceraAdmin titulo="Hoy" bajada="Lo que pide atención. Cada número lleva a la sección donde se resuelve." />
      <ul className="m-0 grid max-w-[1000px] list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
        {tarjetas.map((t) => (
          <li key={t.titulo} className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
            <p className="m-0 font-display text-[40px] leading-none">{t.n}</p>
            <h2 className="m-0 text-[20px]">{t.titulo}</h2>
            <p className="m-0 text-[15px] text-tinta-suave">{t.detalle}</p>
            <Link href={t.href} className="mt-1 inline-flex min-h-[44px] items-center font-bold text-oliva-profundo underline underline-offset-4">{t.accion}</Link>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-6 max-w-[860px] text-[15px]">
        Todo cambio importante queda anotado en el <Link href="/admin/configuracion/actividad" className="font-bold text-oliva-profundo">registro de actividad</Link>, con su autora, la fecha y el antes y el después.
      </p>
    </>
  );
}
