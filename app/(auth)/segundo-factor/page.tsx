import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { factoresTotp } from '@/datos/mfa';
import { nivelAutenticacion, tieneRolAdmin, usuarioActual } from '@/datos/sesion';
import { FormVerificar } from './FormVerificar';

export const metadata: Metadata = { title: 'Segundo factor', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ siguiente?: string }> };

/** Segundo paso del ingreso: código de la app autenticadora. Solo para quien ya registró un factor. */
export default async function SegundoFactor({ searchParams }: Props) {
  const { siguiente } = await searchParams;
  const destino = siguiente && siguiente.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '';
  if (!(await usuarioActual())) redirect(`/ingresar?siguiente=${encodeURIComponent(destino || '/campus')}`);
  const verificados = (await factoresTotp()).filter((f) => f.verificado);
  if (!verificados.length) redirect((await tieneRolAdmin()) ? `/segundo-factor/activar?siguiente=${encodeURIComponent(destino || '/admin')}` : '/campus');
  if ((await nivelAutenticacion()).actual === 'aal2') redirect(destino || ((await tieneRolAdmin()) ? '/admin' : '/campus'));
  return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px] leading-tight">Segundo factor</h1>
      <p className="m-0">Abra su app autenticadora y escriba el código de 6 dígitos que muestra para Albor. El código cambia cada 30 segundos.</p>
      <FormVerificar siguiente={destino} />
      <p className="m-0 text-[15px] text-tinta-suave">¿Perdió el teléfono o la app? No se puede recuperar el acceso solo con el correo: siga el procedimiento de recuperación de la academia (verificación de identidad por otra vía).</p>
    </main>
  );
}
