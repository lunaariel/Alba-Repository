import type { Metadata } from 'next';
import { miPerfil, misTalleres, type TallerInscripto } from '@/datos/campus';
import { formatearHorario } from '@/dominio/talleres';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { Aviso } from '@/ui/Formulario';
import { cancelarInscripcionTaller } from '../acciones';

export const metadata: Metadata = { title: 'Mis talleres' };

type Props = { searchParams: Promise<{ aviso?: string }> };

function Estado({ t }: { t: TallerInscripto }) {
  if (t.estado === 'cancelado') {
    return (
      <p className="m-0 mt-1 font-bold text-error">
        Este taller fue cancelado{t.motivoCancelacion ? `: ${t.motivoCancelacion}` : '.'}
        {t.inscripcion === 'reembolso_pendiente' && <span className="block font-normal text-marron">Su pago queda pendiente de reembolso. Nos comunicaremos con usted; el reembolso figura como hecho recién cuando la pasarela de pago lo confirme.</span>}
      </p>
    );
  }
  if (t.inscripcion === 'cancelada') return <p className="m-0 mt-1 text-tinta-suave">Usted canceló esta inscripción.</p>;
  if (t.inscripcion === 'reembolsada') return <p className="m-0 mt-1 text-tinta-suave">Inscripción reembolsada.</p>;
  if (t.reprogramadoDesde) {
    return <p className="m-0 mt-1 font-bold text-oliva-profundo">Reprogramado. Nueva fecha arriba (antes: {formatearHorario(t.reprogramadoDesde, t.zonaHoraria)}).</p>;
  }
  return <p className="m-0 mt-1 font-bold text-oliva-profundo">Inscripción confirmada</p>;
}

function Fila({ t, zona, pasado }: { t: TallerInscripto; zona: string; pasado: boolean }) {
  const activa = t.inscripcion === 'confirmada' && t.estado === 'publicado';
  return (
    <li className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <div className="min-w-0 flex-[1_1_320px]">
        <h2 className="m-0 font-texto text-[20px] font-bold">{t.titulo}</h2>
        <p className="m-0 mt-1 text-tinta-suave">{formatearHorario(t.iniciaEn, t.zonaHoraria, zona)}</p>
        <Estado t={t} />
      </div>
      {!pasado && activa && (
        <div className="flex flex-col items-start gap-3">
          {t.enlace ? (
            <div className="flex flex-col items-start gap-1">
              <EnlaceBoton href={t.enlace} tamano="compacto">Entrar a la videollamada</EnlaceBoton>
              <span className="text-[14px] text-tinta-suave">El enlace es personal: no lo comparta.</span>
            </div>
          ) : (
            <p className="m-0 max-w-[280px] text-[15px] text-tinta-suave">El enlace de la videollamada aparecerá aquí desde el {formatearHorario(t.enlaceDesde, t.zonaHoraria, zona)}.</p>
          )}
          {t.origen !== 'compra' && t.iniciaEn.getTime() > Date.now() && (
            <details className="text-[15px]">
              <summary className="cursor-pointer font-bold text-oliva-profundo">Cancelar mi inscripción</summary>
              <form action={cancelarInscripcionTaller} className="mt-2 flex max-w-[300px] flex-col gap-2">
                <input type="hidden" name="taller" value={t.id} />
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="entiendo" value="si" required className="mt-1 h-5 w-5 shrink-0 accent-[#4E6049]" />
                  <span>Entiendo que libero mi lugar y otra persona puede ocuparlo.</span>
                </label>
                <div><button type="submit" className="min-h-[44px] rounded-md border-2 border-error bg-blanco-calido px-4 font-bold text-error">Cancelar inscripción</button></div>
              </form>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

export default async function MisTalleres({ searchParams }: Props) {
  const [talleres, perfil, { aviso }] = await Promise.all([misTalleres(), miPerfil(), searchParams]);
  const ahora = Date.now();
  const proximos = talleres.filter((t) => t.terminaEn.getTime() >= ahora);
  const pasados = talleres.filter((t) => t.terminaEn.getTime() < ahora).reverse();
  return (
    <>
      <EncabezadoCampus titulo="Mis talleres" bajada="Los horarios se muestran en la hora del taller y, si vive en otra zona, también en la suya." />
      <Contenedor className="flex flex-col gap-10 pb-20 pt-2">
        {aviso === 'inscripcion' && (
          <Aviso tipo="ok">Listo: su inscripción está confirmada. Por ahora no enviamos correos: esta confirmación y el enlace de la videollamada quedan aquí, en Mis talleres.</Aviso>
        )}
        {aviso === 'cancelada' && <Aviso tipo="ok">Su inscripción quedó cancelada y el lugar quedó libre.</Aviso>}
        {aviso === 'error' && <Aviso tipo="error">No se pudo completar. Revise que haya marcado la confirmación e intente de nuevo.</Aviso>}
        {proximos.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {proximos.map((t) => <Fila key={t.id} t={t} zona={perfil.zonaHoraria} pasado={false} />)}
          </ul>
        ) : (
          <div className="max-w-[640px] rounded-2xl bg-arena p-8">
            <p className="m-0 font-display text-2xl">No tiene talleres próximos.</p>
            <div className="mt-4"><EnlaceAccion href="/talleres">Ver los talleres en vivo</EnlaceAccion></div>
          </div>
        )}
        {pasados.length > 0 && (
          <section aria-labelledby="pasados">
            <h2 id="pasados" className="m-0 mb-4 text-[24px]">Talleres anteriores</h2>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {pasados.map((t) => <Fila key={t.id} t={t} zona={perfil.zonaHoraria} pasado />)}
            </ul>
          </section>
        )}
      </Contenedor>
    </>
  );
}
