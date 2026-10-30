import { Encabezado, Pie } from '@/ui/estructura';

// Contenido que la administradora edita en cualquier momento: se lee de la base en cada solicitud.
export const dynamic = 'force-dynamic';

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Encabezado />
      <main id="contenido" className="flex-1">{children}</main>
      <Pie />
    </div>
  );
}
