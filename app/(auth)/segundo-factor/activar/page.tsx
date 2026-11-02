import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { factoresTotp } from '@/datos/mfa';
import { nivelAutenticacion, politicaSeguridad, tieneRolAdmin, usuarioActual } from '@/datos/sesion';
import { Aviso } from '@/ui/Formulario';
import { Activar } from './Activar';

export const metadata: Metadata = { title: 'Activar el segundo factor', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ ok?: string; siguiente?: string }> };

/**
 * Activación del segundo factor de la administradora (TOTP de Supabase Auth). Solo cuentas con rol admin:
 * a cualquier otra persona le responde «no encontrado». Para agregar un factor de respaldo hay que haber
 * verificado antes el factor actual en esta sesión.
 */
export default async function ActivarSegundoFactor({ searchParams }: Props) {
  const { ok, siguiente } = await searchParams;
  const destino = siguiente && siguiente.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/admin';
  if (!(await usuarioActual())) redirect(`/ingresar?siguiente=${encodeURIComponent('/segundo-factor/activar')}`);
  if (!(await tieneRolAdmin())) notFound();
  const verificados = (await factoresTotp()).filter((f) => f.verificado);
  const nivel = await nivelAutenticacion();
  if (verificados.length && nivel.actual !== 'aal2') redirect(`/segundo-factor?siguiente=${encodeURIComponent('/segundo-factor/activar')}`);
  const politica = await politicaSeguridad();
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px] leading-tight">{verificados.length ? 'Agregar un factor de respaldo' : 'Activar el segundo factor'}</h1>
      {ok ? (
        <>
          <Aviso tipo="ok">Segundo factor activo. Desde ahora, al ingresar se le pedirá el código de su app autenticadora.</Aviso>
          <p className="m-0">Recomendación: registre también un factor de respaldo en un segundo dispositivo que guarde en un lugar seguro. Si pierde el teléfono, ese respaldo evita el procedimiento de recuperación.</p>
          <p className="m-0"><Link href={destino} className="font-bold text-oliva-profundo underline underline-offset-4">Continuar</Link></p>
        </>
      ) : (
        <>
          <p className="m-0">
            {politica.mfaAdminObligatorio
              ? 'El panel exige un segundo factor. Necesita una app autenticadora en su teléfono (por ejemplo, Google Authenticator, Microsoft Authenticator o 1Password).'
              : 'Proteja el panel con un segundo factor: una app autenticadora en su teléfono (por ejemplo, Google Authenticator, Microsoft Authenticator o 1Password).'}
          </p>
          <Activar siguiente={destino} />
        </>
      )}
    </main>
  );
}
