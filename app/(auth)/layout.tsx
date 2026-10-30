import { Encabezado, Pie } from '@/ui/estructura';

export default function LayoutCuenta({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Encabezado />
      <div id="contenido">{children}</div>
      <Pie />
    </>
  );
}
