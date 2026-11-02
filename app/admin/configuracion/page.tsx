import type { Metadata } from 'next';
import Link from 'next/link';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';
import { exigirAdmin, nivelAutenticacion, politicaSeguridad } from '@/datos/sesion';
import { factoresTotp } from '@/datos/mfa';
import { ERRORES_MFA } from '@/dominio/mfa';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { quitarFactor } from '../../(auth)/segundo-factor/acciones';
import { configuracion } from '@/datos/publico';

export const metadata: Metadata = { title: 'Configuración' };

// La página se verifica por sí misma (además del layout): Next puede renderizarla en paralelo al layout
// y su contenido no debe viajar en la respuesta 404 a quien no es admin.
const fecha = (d: string) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'America/Guatemala' }).format(new Date(d));
const OKS: Record<string, string> = { factor_quitado: 'Factor quitado. Queda registrado.' };

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await exigirAdmin();
  const { ok, error } = await searchParams;
  const [politica, factores, nivel] = await Promise.all([politicaSeguridad(), factoresTotp(), nivelAutenticacion()]);
  const mfa = politica.mfaAdminObligatorio;
  const verificados = factores.filter((f) => f.verificado);
  const { talleresPublicos } = await configuracion();
  return (
    <>
      <CabeceraAdmin titulo="Configuración" />
      <div className="grid max-w-[1000px] gap-5 md:grid-cols-2">
        <section aria-labelledby="actividad" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="actividad" className="m-0 text-[22px]">Registro de actividad</h2>
            <EstadoChip estado="publicado" texto="Disponible" />
          </div>
          <p className="m-0 mt-2">Quién cambió qué y cuándo, con el antes y el después. Nadie puede editarlo ni borrarlo.</p>
          <Link href="/admin/configuracion/actividad" className="mt-4 inline-flex min-h-[44px] items-center rounded-sm bg-oliva-profundo px-[18px] font-bold text-marfil no-underline hover:bg-marron">
            Abrir el registro
          </Link>
        </section>
        <section aria-labelledby="talleres-publicos" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="talleres-publicos" className="m-0 text-[22px]">Talleres en el sitio</h2>
            <EstadoChip estado={talleresPublicos ? 'publicado' : 'pendiente'} texto={talleresPublicos ? 'Ofrecidos al público' : 'No ofrecidos todavía'} />
          </div>
          <p className="m-0 mt-2">
            {talleresPublicos
              ? 'El sitio muestra los talleres publicados y admite inscripciones.'
              : 'Primero se lanzan los cursos. Puede seguir preparando talleres en el panel, pero el sitio no los muestra ni admite inscripciones nuevas. Las inscripciones existentes se conservan.'}
          </p>
          <p className="m-0 mt-2 text-[15px] text-tinta-suave">Se habilitan cuando se autorice el lanzamiento de los talleres.</p>
        </section>
        <section aria-labelledby="seguridad" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="seguridad" className="m-0 text-[22px]">Seguridad de la cuenta administradora</h2>
            <EstadoChip estado={mfa ? 'publicado' : 'pendiente'} texto={mfa ? 'Segundo factor exigido' : 'Segundo factor no exigido'} />
          </div>
          {ok && OKS[ok] && <p role="status" className="m-0 mt-3 rounded-lg bg-arena p-3">{OKS[ok]}</p>}
          {error && <p role="alert" className="m-0 mt-3 rounded-lg bg-arena p-3 text-error">{ERRORES_MFA[error] ?? 'No se pudo completar la acción.'}</p>}
          <p className="m-0 mt-2">
            {mfa
              ? `El panel exige el segundo factor (app autenticadora) en cada ingreso. Las operaciones sensibles (precios, publicación, becas, revocaciones, reembolsos, bloqueos y configuración) piden además el código del momento, válido para una sola operación durante ${politica.reforzadaMinutos} minutos.`
              : 'El segundo factor está listo, pero la política todavía no lo exige: se enciende por script, con responsable, después de registrar su factor y uno de respaldo, para no dejarla sin acceso.'}
          </p>
          <h3 className="m-0 mt-4 text-[18px]">Sus factores</h3>
          {verificados.length ? (
            <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
              {verificados.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-arena px-4 py-3">
                  <span><b>{f.nombre}</b> · app autenticadora · desde el {fecha(f.creado)}</span>
                  {nivel.actual === 'aal2' && (
                    <ConfirmarAccion accion={quitarFactor} campos={{ factorId: f.id }} textoBoton="Quitar" titulo="¿Quitar este factor?" estilo="enlacePeligro" peligro reforzada>
                      <p className="m-0">Ese dispositivo deja de servir para ingresar al panel. {mfa ? 'Mientras la política lo exija, siempre tiene que quedar al menos un factor.' : ''}</p>
                    </ConfirmarAccion>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-2 text-tinta-suave">Todavía no registró ningún factor.</p>
          )}
          <Link href="/segundo-factor/activar?siguiente=/admin/configuracion"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-sm border-2 border-oliva-profundo px-[18px] font-bold text-oliva-profundo no-underline hover:bg-arena">
            {verificados.length ? 'Agregar un factor de respaldo' : 'Activar el segundo factor'}
          </Link>
          <p className="m-0 mt-3 text-[15px] text-tinta-suave">Si pierde el teléfono y no tiene un factor de respaldo, la recuperación no se hace por correo: requiere verificar su identidad por otra vía y un script del servidor con responsable (procedimiento de la academia). Los permisos de administración solo se otorgan con un script del servidor que exige identificar a la persona responsable.</p>
        </section>
        <section aria-labelledby="academia" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="academia" className="m-0 text-[22px]">Academia y ventas</h2>
            <EstadoChip estado="pendiente" texto="Entrega 6" />
          </div>
          <p className="m-0 mt-2">Nombre, correo y WhatsApp de contacto, zona horaria, apertura de inscripciones y estado de cada integración.</p>
          <p className="m-0 mt-3 text-[15px] text-tinta-suave">Las inscripciones solo podrán abrirse con la pasarela, la factura FEL y la política de reembolsos listas.</p>
        </section>
      </div>
    </>
  );
}
