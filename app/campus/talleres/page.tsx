import type { Metadata } from 'next';
import { miPerfil, misTalleres, type TallerInscripto } from '@/datos/campus';
import { formatearHorario } from '@/dominio/talleres';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';

export const metadata: Metadata = { title: 'Mis talleres' };

function Fila({ t, zona, pasado }: { t: TallerInscripto; zona: string; pasado: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <div className="min-w-0 flex-[1_1_320px]">
        <h2 className="m-0 font-texto text-[20px] font-bold">{t.titulo}</h2>
        <p className="m-0 mt-1 text-tinta-suave">{formatearHorario(t.iniciaEn, t.zonaHoraria, zona)}</p>
        {t.estado === 'cancelado' && <p className="m-0 mt-1 font-bold text-error">Este taller fue cancelado. Le escribiremos por correo.</p>}
      </div>
      {!pasado && t.estado === 'publicado' && (
        t.enlace ? (
          <div className="flex flex-col items-start gap-1">
            <EnlaceBoton href={t.enlace} tamano="compacto">Entrar a la videollamada</EnlaceBoton>
            <span className="text-[14px] text-tinta-suave">El enlace es personal: no lo comparta.</span>
          </div>
        ) : (
          <p className="m-0 max-w-[260px] text-[15px] text-tinta-suave">El enlace de la videollamada aparecerá aquí antes del encuentro.</p>
        )
      )}
    </li>
  );
}

export default async function MisTalleres() {
  const [talleres, perfil] = await Promise.all([misTalleres(), miPerfil()]);
  const ahora = Date.now();
  const proximos = talleres.filter((t) => t.terminaEn.getTime() >= ahora);
  const pasados = talleres.filter((t) => t.terminaEn.getTime() < ahora).reverse();
  return (
    <>
      <EncabezadoCampus titulo="Mis talleres" bajada="Los horarios se muestran en la hora del taller y, si vive en otra zona, también en la suya." />
      <Contenedor className="flex flex-col gap-10 pb-20 pt-2">
        {proximos.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {proximos.map((t) => <Fila key={t.slug} t={t} zona={perfil.zonaHoraria} pasado={false} />)}
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
              {pasados.map((t) => <Fila key={t.slug} t={t} zona={perfil.zonaHoraria} pasado />)}
            </ul>
          </section>
        )}
      </Contenedor>
    </>
  );
}
