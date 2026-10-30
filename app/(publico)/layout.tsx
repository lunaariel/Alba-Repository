import { Encabezado, Pie } from '@/ui/estructura';

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Encabezado />
      <main id="contenido">{children}</main>
      <Pie />
    </>
  );
}
