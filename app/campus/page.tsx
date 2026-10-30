import type { Metadata } from 'next';
import { miPerfil, misCursos } from '@/datos/campus';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus, TarjetaCursoCampus } from '@/ui/campus';
import { EnlaceBoton } from '@/ui/acciones';

export const metadata: Metadata = { title: 'Mis cursos' };

export default async function MisCursos() {
  const [perfil, cursos] = await Promise.all([miPerfil(), misCursos()]);
  const nombre = perfil.nombre.split(' ')[0];
  return (
    <>
      <EncabezadoCampus
        titulo="Mis cursos"
        bajada={nombre ? `Hola, ${nombre}. Avance a su ritmo: el acceso a sus cursos no vence.` : 'El acceso a sus cursos no vence.'}
      />
      <Contenedor className="pb-20 pt-4">
        {cursos.length > 0 ? (
          <ul className="m-0 grid list-none gap-5 p-0 lg:grid-cols-2">
            {cursos.map((c) => <TarjetaCursoCampus key={c.id} curso={c} />)}
          </ul>
        ) : (
          <div className="max-w-[640px] rounded-2xl bg-arena p-8">
            <p className="m-0 font-display text-2xl">Todavía no tiene cursos.</p>
            <p className="m-0 mt-2">Cuando compre un curso, aparecerá aquí con su avance.</p>
            <div className="mt-5"><EnlaceBoton href="/cursos" tamano="compacto">Ver los cursos</EnlaceBoton></div>
          </div>
        )}
      </Contenedor>
    </>
  );
}
