import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { formatearUSD } from '@/dominio/dinero';
import { CabeceraAdmin, EstadoChip } from '@/ui/admin/estructura';
import { PestanasCurso } from './PestanasCurso';

export default async function LayoutCurso({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const curso = await cursoAdmin(id);
  if (!curso) notFound();
  const h = curso.historial;
  return (
    <>
      <CabeceraAdmin
        titulo={curso.titulo}
        migas={[{ href: '/admin/cursos', texto: 'Cursos' }]}
        bajada={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <EstadoChip estado={curso.estado} />
            <span>{curso.precioCentavos > 0 ? formatearUSD(curso.precioCentavos) : 'Sin precio'}</span>
            <span>· {h.alumnos === 1 ? '1 alumno' : `${h.alumnos} alumnos`} con acceso</span>
            <span>· {h.certificados === 1 ? '1 certificado' : `${h.certificados} certificados`}</span>
          </span>
        }
      />
      <PestanasCurso id={curso.id} />
      {children}
    </>
  );
}
