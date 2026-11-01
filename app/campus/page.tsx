import type { Metadata } from 'next';
import { miPerfil, misCursos, misCursosVencidos } from '@/datos/campus';
import { INSCRIPCIONES_ABIERTAS } from '@/config/comercio';
import { formatearUSD } from '@/dominio/dinero';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus, TarjetaCursoCampus } from '@/ui/campus';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { Aviso } from '@/ui/Formulario';
import { obtenerCertificadoHistorico } from './acciones';

export const metadata: Metadata = { title: 'Mis cursos' };

const AVISOS: Record<string, { tipo: 'ok' | 'error'; texto: string }> = {
  'certificado-listo': { tipo: 'ok', texto: 'Su certificado está listo. Puede descargarlo cuando quiera.' },
  'certificado-error': { tipo: 'error', texto: 'No pudimos emitir el certificado. Escríbanos y lo revisamos.' },
};

type Props = { searchParams: Promise<{ aviso?: string }> };

export default async function MisCursos({ searchParams }: Props) {
  const [perfil, cursos, vencidos, { aviso }] = await Promise.all([miPerfil(), misCursos(), misCursosVencidos(), searchParams]);
  const fecha = (d: Date) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'America/Guatemala' }).format(d);
  const nombre = perfil.nombre.split(' ')[0];
  const mensaje = aviso ? AVISOS[aviso] : undefined;
  return (
    <>
      <EncabezadoCampus
        titulo="Mis cursos"
        bajada={nombre ? `Hola, ${nombre}. Avance a su ritmo: cada curso indica hasta cuándo tiene acceso.` : 'Cada curso indica hasta cuándo tiene acceso.'}
      />
      <Contenedor className="pb-20 pt-4">
        {mensaje && <div className="mb-6 max-w-[860px]"><Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso></div>}
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
                  {v.puedeObtenerCertificado && (
                    <form action={obtenerCertificadoHistorico} className="mt-3">
                      <input type="hidden" name="curso" value={v.id} />
                      <p className="m-0 text-[15px]">Completó el curso antes del vencimiento: puede obtener su certificado.</p>
                      <button type="submit" className="mt-2 min-h-[44px] rounded-md border-2 border-oliva-profundo bg-blanco-calido px-4 font-bold text-oliva-profundo hover:bg-arena">
                        Obtener mi certificado
                      </button>
                    </form>
                  )}
                  {v.oferta && v.oferta.totalMeses !== null && (
                    <div className="mt-4 rounded-xl bg-arena px-4 py-3">
                      <p className="m-0 font-bold">Renovar el acceso</p>
                      <p className="m-0 mt-1 text-[15px]">
                        Precio vigente {formatearUSD(v.oferta.precioCentavos)}: {v.oferta.duracionMeses} {v.oferta.duracionMeses === 1 ? 'mes' : 'meses'} de duración
                        más {v.oferta.mesesAdicionales} meses adicionales, en total {v.oferta.totalMeses} meses desde que se confirma el pago.
                        {v.oferta.venceSiConfirmaHoy && <> Si el pago se confirmara hoy, tendría acceso hasta el {fecha(v.oferta.venceSiConfirmaHoy)}.</>}
                      </p>
                      <p className="m-0 mt-1 text-[14px] text-tinta-suave">Renovar no reinicia su avance ni sus resultados, y sigue en la misma versión del curso.</p>
                      {INSCRIPCIONES_ABIERTAS && v.oferta.disponible
                        ? <div className="mt-2"><EnlaceAccion href={`/cursos/${v.slug}`}>Renovar</EnlaceAccion></div>
                        : <p className="m-0 mt-2 text-[15px] font-bold text-oliva-profundo">Las compras abren pronto.</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </Contenedor>
    </>
  );
}
