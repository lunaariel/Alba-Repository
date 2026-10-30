import { Encabezado, Pie } from '@/ui/estructura';

// Contenido que la administradora edita en cualquier momento: se lee de la base en cada solicitud.
export const dynamic = 'force-dynamic';

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Encabezado />
      <main id="contenido">{children}</main>
      <Pie />
    </>
  );
}
