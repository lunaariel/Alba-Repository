import { Encabezado, Pie } from '@/ui/estructura';

// Contenido que la administradora edita en cualquier momento: se lee de la base en cada solicitud.
export const dynamic = 'force-dynamic';

export default function LayoutCuenta({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Encabezado />
      <div id="contenido">{children}</div>
      <Pie />
    </>
  );
}
