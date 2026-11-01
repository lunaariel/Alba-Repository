import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { configuracion, tallerPorSlug } from '@/datos/publico';
import { formatearHorario, textoCupo } from '@/dominio/talleres';
import { formatearUSD } from '@/dominio/dinero';
import { INSCRIPCIONES_ABIERTAS } from '@/config/comercio';
import { Contenedor } from '@/ui/estructura';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { Parrafos } from '@/ui/contenido';
import { Aviso } from '@/ui/Formulario';
import { usuarioActual } from '@/datos/sesion';
import { clienteSesion } from '@/datos/supabase';
import { inscribirmeTaller } from '../../../campus/acciones';
import { HoraLocal } from './HoraLocal';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ aviso?: string }> };

const AVISOS: Record<string, string> = {
  sin_cupo: 'Se ocupó el último lugar mientras se inscribía: el cupo está completo.',
  ya_inscripto: 'Ya está inscripta o inscripto en este taller. Lo encuentra en Mis talleres.',
  taller_no_disponible: 'Este taller ya no admite inscripciones.',
  taller_pago: 'Este taller es pago: la inscripción abre al habilitarse las ventas.',
  talleres_no_disponibles: 'Los talleres todavía no admiten inscripciones.',
  error: 'No se pudo completar la inscripción. Intente de nuevo.',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await tallerPorSlug((await params).slug);
  if (!t) return { title: 'Taller no encontrado' };
  return { title: t.titulo, description: t.descripcion?.slice(0, 160), alternates: { canonical: `/talleres/${t.slug}` } };
}


export default async function DetalleTaller({ params, searchParams }: Props) {
  const [{ slug }, { aviso }, config] = await Promise.all([params, searchParams, configuracion()]);
  // Talleres no habilitados para el público: sin ficha ni inscripción (los datos se conservan).
  if (!config.talleresPublicos) notFound();
  const taller = await tallerPorSlug(slug);
  if (!taller) notFound();
  const gratuito = taller.precioCentavos === 0;
  // Talleres gratuitos: inscripción real desde ya (decisión de la titular), con sesión iniciada.
  const usuario = gratuito ? await usuarioActual() : null;
  const inscripta = usuario
    ? Boolean((await (await clienteSesion()).from('inscripciones_taller').select('id').eq('taller_id', taller.id).eq('estado', 'confirmada').maybeSingle()).data)
    : false;

  const cupo = textoCupo(taller.cupo, taller.ocupados, taller.estado);
  const completo = taller.cupo !== null && taller.ocupados >= taller.cupo;
  const disponible = taller.estado === 'publicado' && !completo && taller.iniciaEn.getTime() > Date.now();
  const puedeInscribirse = INSCRIPCIONES_ABIERTAS && disponible && !gratuito;

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
            {aviso && AVISOS[aviso] && <div className="mb-4"><Aviso tipo="error">{AVISOS[aviso]}</Aviso></div>}
            {gratuito && inscripta ? (
              <>
                <p className="m-0 font-bold">Ya está inscripta o inscripto.</p>
                <div className="mt-2"><EnlaceAccion href="/campus/talleres">Ver en Mis talleres</EnlaceAccion></div>
              </>
            ) : gratuito && disponible ? (
              usuario ? (
                <form action={inscribirmeTaller}>
                  <input type="hidden" name="taller" value={taller.id} />
                  <input type="hidden" name="slug" value={taller.slug} />
                  <button type="submit" className="min-h-[54px] rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil hover:bg-marron">Inscribirme gratis</button>
                </form>
              ) : (
                <>
                  <EnlaceBoton href={`/ingresar?siguiente=${encodeURIComponent(`/talleres/${taller.slug}`)}`}>Ingresar para inscribirme</EnlaceBoton>
                  <p className="m-0 mt-2 text-[15px]">¿No tiene cuenta? <a href="/registro" className="font-bold text-oliva-profundo">Regístrese</a>, es gratis.</p>
                </>
              )
            ) : puedeInscribirse ? (
              <EnlaceBoton href={`/talleres/${taller.slug}/inscribirme`}>Inscribirme</EnlaceBoton>
            ) : disponible && !gratuito ? (
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
