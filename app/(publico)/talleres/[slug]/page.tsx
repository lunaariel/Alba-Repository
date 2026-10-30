import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tallerPorSlug } from '@/datos/publico';
import { formatearHorario, textoCupo } from '@/dominio/talleres';
import { formatearUSD } from '@/dominio/dinero';
import { INSCRIPCIONES_ABIERTAS } from '@/config/comercio';
import { Contenedor } from '@/ui/estructura';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { Parrafos } from '@/ui/contenido';
import { HoraLocal } from './HoraLocal';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await tallerPorSlug((await params).slug);
  if (!t) return { title: 'Taller no encontrado' };
  return { title: t.titulo, description: t.descripcion?.slice(0, 160), alternates: { canonical: `/talleres/${t.slug}` } };
}


export default async function DetalleTaller({ params }: Props) {
  const taller = await tallerPorSlug((await params).slug);
  if (!taller) notFound();

  const cupo = textoCupo(taller.cupo, taller.ocupados, taller.estado);
  const completo = taller.cupo !== null && taller.ocupados >= taller.cupo;
  const terminado = taller.terminaEn.getTime() < Date.now();
  const puedeInscribirse = INSCRIPCIONES_ABIERTAS && taller.estado === 'publicado' && !completo && !terminado;

  return (
    <section aria-labelledby="titulo">
      <Contenedor className="flex flex-wrap gap-x-16 gap-y-10 py-[clamp(40px,6vw,88px)]">
        <div className="min-w-0 flex-[1_1_480px]">
          <p className="m-0 text-[15px] text-tinta-suave">Taller en vivo por videollamada</p>
          <h1 id="titulo" className="m-0 mt-3 text-[clamp(36px,4.2vw,58px)] leading-[1.08]">{taller.titulo}</h1>
          {taller.descripcion && <div className="mt-6 flex max-w-[34em] flex-col gap-4 text-lg"><Parrafos texto={taller.descripcion} /></div>}
        </div>
        <aside aria-label="Fecha e inscripción" className="h-fit flex-[0_1_380px] rounded-2xl border-[1.5px] border-borde-bandeja bg-arena p-7">
          <p className="m-0 text-lg font-bold">{formatearHorario(taller.iniciaEn, taller.zonaHoraria)}</p>
          <HoraLocal inicio={taller.iniciaEn.toISOString()} zonaTaller={taller.zonaHoraria} />
          <p className="m-0 mt-4 font-display text-[32px] font-semibold leading-none">
            {taller.precioCentavos > 0 ? formatearUSD(taller.precioCentavos) : 'Gratuito'}
          </p>
          <p className={`m-0 mt-3 font-bold ${taller.estado === 'cancelado' ? 'text-error' : 'text-oliva-profundo'}`}>{cupo}</p>
          <div className="mt-6">
            {puedeInscribirse ? (
              <EnlaceBoton href={`/talleres/${taller.slug}/inscribirme`}>Inscribirme</EnlaceBoton>
            ) : taller.estado === 'publicado' && !completo && !terminado ? (
              <>
                <p className="m-0">Las inscripciones abren pronto.</p>
                <div className="mt-2"><EnlaceAccion href="/contacto">Quiero recibir el aviso</EnlaceAccion></div>
              </>
            ) : null}
          </div>
        </aside>
      </Contenedor>
    </section>
  );
}
