import type { Metadata } from 'next';
import Link from 'next/link';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';
import { exigirAdmin, mfaAdminObligatorio } from '@/datos/sesion';

export const metadata: Metadata = { title: 'Configuración' };

// La página se verifica por sí misma (además del layout): Next puede renderizarla en paralelo al layout
// y su contenido no debe viajar en la respuesta 404 a quien no es admin.
export default async function Configuracion() {
  await exigirAdmin();
  const mfa = mfaAdminObligatorio();
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
 <section aria-labelledby="seguridad" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="seguridad" className="m-0 text-[22px]">Seguridad de la cuenta administradora</h2>
            <EstadoChip estado={mfa ? 'publicado' : 'pendiente'} texto={mfa ? 'Segundo factor exigido' : 'Segundo factor no activo'} />
          </div>
          <p className="m-0 mt-2">
            {mfa
              ? 'El panel exige verificar con un segundo factor (aplicación de autenticación).'
              : 'Hoy el panel se protege con contraseña, rol verificado en cada solicitud y registro de actividad. El segundo factor (aplicación de autenticación) está preparado pero no activo: se activará antes del lanzamiento, cuando su factor quede registrado, para no dejarla sin acceso.'}
          </p>
          <p className="m-0 mt-2 text-[15px] text-tinta-suave">Los permisos de administración solo se otorgan con un script del servidor que exige identificar a la persona responsable.</p>
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
