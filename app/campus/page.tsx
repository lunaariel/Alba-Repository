import type { Metadata } from 'next';
import { miPerfil, misCursos, misCursosVencidos } from '@/datos/campus';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus, TarjetaCursoCampus } from '@/ui/campus';
import { EnlaceBoton } from '@/ui/acciones';

export const metadata: Metadata = { title: 'Mis cursos' };

export default async function MisCursos() {
  const [perfil, cursos, vencidos] = await Promise.all([miPerfil(), misCursos(), misCursosVencidos()]);
  const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'America/Guatemala' }).format(d);
  const nombre = perfil.nombre.split(' ')[0];
  return (
    <>
      <EncabezadoCampus
        titulo="Mis cursos"
        bajada={nombre ? `Hola, ${nombre}. Avance a su ritmo: cada curso indica hasta cuándo tiene acceso.` : 'Cada curso indica hasta cuándo tiene acceso.'}
      />
      <Contenedor className="pb-20 pt-4">
        {cursos.length > 0 ? (
          <ul className="m-0 grid list-none gap-5 p-0 lg:grid-cols-2">
            {cursos.map((c) => <TarjetaCursoCampus key={c.id} curso={c} />)}
          </ul>
        ) : vencidos.length > 0 ? null : (
          <div className="max-w-[640px] rounded-2xl bg-arena p-8">
            <p className="m-0 font-display text-2xl">Todavía no tiene cursos.</p>
            <p className="m-0 mt-2">Cuando compre un curso, aparecerá aquí con su avance.</p>
            <div className="mt-5"><EnlaceBoton href="/cursos" tamano="compacto">Ver los cursos</EnlaceBoton></div>
          </div>
        )}
        {vencidos.length > 0 && (
          <section aria-labelledby="vencidos" className="mt-10 max-w-[860px]">
            <h2 id="vencidos" className="m-0 text-[24px]">Cursos con el acceso vencido</h2>
            <p className="m-0 mt-1 text-[15px] text-tinta-suave">Ya no puede ver sus lecciones ni materiales. Su avance, sus resultados y sus certificados se conservan.</p>
            <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
              {vencidos.map((v) => (
                <li key={v.id} className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-5">
                  <p className="m-0 font-bold">{v.titulo}</p>
                  <p className="m-0 mt-1 text-[15px] text-tinta-suave">Acceso vencido el {fecha(v.venceEn)}.</p>
                  {v.certificados.map((c) => (
                    <p key={c.id} className="m-0 mt-2 text-[15px]">
                      Certificado: <a href={`/campus/certificados/${c.id}`} className="font-bold text-oliva-profundo">descargar</a> (código {c.codigo}). Sigue siendo válido.
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </Contenedor>
    </>
  );
}
