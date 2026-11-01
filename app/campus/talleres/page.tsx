import type { Metadata } from 'next';
import Link from 'next/link';
import { miPerfil, misAvisos, misTalleres, type AvisoCampus, type TallerInscripto } from '@/datos/campus';
import { configuracion } from '@/datos/publico';
import { formatearHorario } from '@/dominio/talleres';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { EnlaceAccion, EnlaceBoton } from '@/ui/acciones';
import { Aviso } from '@/ui/Formulario';
import { cancelarInscripcionTaller, marcarAvisosLeidos, responderReprogramacion } from '../acciones';

export const metadata: Metadata = { title: 'Mis talleres' };

type Props = { searchParams: Promise<{ aviso?: string }> };

const HORA = 3600 * 1000;
const fechaCorta = (d: Date, zona: string) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: zona }).format(d);

const AVISOS_OK: Record<string, string> = {
  inscripcion: 'Listo: su inscripción está confirmada. Por ahora no enviamos correos: esta confirmación y el enlace de la videollamada quedan aquí, en Mis talleres.',
  cancelada: 'Su inscripción quedó cancelada y el lugar quedó libre.',
  respuesta_aceptada: 'Registramos que acepta la nueva fecha. Su lugar sigue reservado.',
  respuesta_reembolso_solicitado: 'Registramos su pedido de reembolso. La academia se comunicará con usted; el reembolso figura como hecho recién cuando la pasarela de pago lo confirme.',
  respuesta_no_asiste: 'Registramos que no puede asistir. Su lugar quedó libre.',
};
const AVISOS_ERROR: Record<string, string> = {
  error: 'No se pudo completar. Revise que haya marcado la confirmación e intente de nuevo.',
  inscripcion_paga: 'Las inscripciones pagas no se cancelan desde el campus. Escriba a la academia.',
  fuera_de_plazo: 'Ya pasó el plazo de cancelación de este taller: no se puede cancelar desde el campus.',
  sin_respuesta_pendiente: 'Esta reprogramación ya tiene una respuesta registrada.',
  taller_ya_empezo: 'El taller ya empezó: no se puede registrar la respuesta. Escriba a la academia.',
  inscripcion_sin_pago: 'Para una inscripción gratuita, elija «No puedo asistir».',
  sin_inscripcion: 'No encontramos una inscripción confirmada para ese taller.',
};

function textoAviso(a: AvisoCampus, talleres: Map<string, TallerInscripto>): string {
  const t = a.tallerId ? talleres.get(a.tallerId) : undefined;
  const nombre = t ? `«${t.titulo}»` : 'un taller';
  const zona = t?.zonaHoraria ?? 'America/Guatemala';
  const nueva = typeof a.detalle.inicia_despues === 'string' ? formatearHorario(new Date(a.detalle.inicia_despues), zona) : null;
  switch (a.tipo) {
    case 'taller_reprogramado':
      return `${nombre} cambió de fecha${nueva ? ` (nueva: ${nueva})` : ''}. ${a.detalle.requiere_respuesta ? 'Necesitamos su respuesta: acepte la nueva fecha o elija otra opción.' : ''}`.trim();
    case 'reprogramacion_pendiente':
      return `${nombre}: todavía no respondió a la nueva fecha. Su inscripción está pendiente de su respuesta.`;
    case 'taller_cancelado':
      return `${nombre} fue cancelado por la academia.`;
    case 'grabacion_disponible':
      return `La grabación de ${nombre} está publicada.`;
    case 'recordatorio_taller':
      return `Recordatorio: ${nombre}${t ? ` es el ${formatearHorario(t.iniciaEn, zona)}` : ' se acerca'}.`;
    default:
      return 'Tiene un aviso nuevo.';
  }
}

function Estado({ t, zona }: { t: TallerInscripto; zona: string }) {
  if (t.estado === 'cancelado') {
    return (
      <p className="m-0 mt-1 font-bold text-error">
        Este taller fue cancelado{t.motivoCancelacion ? `: ${t.motivoCancelacion}` : '.'}
        {t.inscripcion === 'reembolso_pendiente' && <span className="block font-normal text-marron">Su pago queda pendiente de reembolso. Nos comunicaremos con usted; el reembolso figura como hecho recién cuando la pasarela de pago lo confirme.</span>}
      </p>
    );
  }
  if (t.inscripcion === 'reembolso_pendiente' && t.respuesta === 'reembolso_solicitado') {
    return <p className="m-0 mt-1 text-marron"><b>Reembolso solicitado</b> por el cambio de fecha. La academia se comunicará con usted.</p>;
  }
  if (t.inscripcion === 'cancelada') {
    if (t.respuesta === 'no_asiste') return <p className="m-0 mt-1 text-tinta-suave">Avisó que no puede asistir a la nueva fecha. Su lugar quedó libre.</p>;
    return <p className="m-0 mt-1 text-tinta-suave">{t.canceladaPor === 'academia' ? 'La academia canceló esta inscripción.' : 'Usted canceló esta inscripción.'}</p>;
  }
  if (t.inscripcion === 'reembolsada') return <p className="m-0 mt-1 text-tinta-suave">Inscripción reembolsada.</p>;
  if (t.respuesta === 'pendiente') {
    return (
      <div className="mt-2 rounded-xl bg-arena px-4 py-3">
        <p className="m-0 font-bold">Cambio de fecha: falta su respuesta</p>
        {t.reprogramadoDesde && <p className="m-0 mt-1 text-[15px]">Fecha original: <s>{formatearHorario(t.reprogramadoDesde, t.zonaHoraria, zona)}</s></p>}
        <p className="m-0 text-[15px]">Nueva fecha: <b>{formatearHorario(t.iniciaEn, t.zonaHoraria, zona)}</b></p>
        <p className="m-0 mt-1 text-[14px] text-tinta-suave">Su lugar sigue reservado mientras decide. No damos por aceptada la nueva fecha sin su respuesta.</p>
      </div>
    );
  }
  if (t.respuesta === 'aceptada') {
    return <p className="m-0 mt-1 font-bold text-oliva-profundo">Nueva fecha aceptada{t.reprogramadoDesde ? <span className="font-normal text-tinta-suave"> (antes: {formatearHorario(t.reprogramadoDesde, t.zonaHoraria, zona)})</span> : null}</p>;
  }
  return <p className="m-0 mt-1 font-bold text-oliva-profundo">Inscripción confirmada</p>;
}

function Responder({ t }: { t: TallerInscripto }) {
  const opciones: [string, string, string][] = [
    ['aceptada', 'Acepto la nueva fecha', 'Confirmo que asistiré en la nueva fecha.'],
    t.paga
      ? ['reembolso_solicitado', 'Prefiero el reembolso', 'Entiendo que dejo el taller y la academia gestionará el reembolso.']
      : ['no_asiste', 'No puedo asistir', 'Entiendo que libero mi lugar y otra persona puede ocuparlo.'],
  ];
  return (
    <div className="flex w-full max-w-[340px] flex-col gap-3">
      {opciones.map(([valor, texto, entiendo]) => (
        <details key={valor} className="rounded-lg border-[1.5px] border-borde-bandeja px-3 py-2 text-[15px]">
          <summary className="cursor-pointer font-bold text-oliva-profundo">{texto}</summary>
          <form action={responderReprogramacion} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="taller" value={t.id} />
            <input type="hidden" name="respuesta" value={valor} />
            <label className="flex items-start gap-2">
              <input type="checkbox" name="entiendo" value="si" required className="mt-1 h-5 w-5 shrink-0 accent-[#4E6049]" />
              <span>{entiendo}</span>
            </label>
            <div>
              <button type="submit" className={valor === 'aceptada' ? 'min-h-[44px] rounded-md bg-oliva-profundo px-4 font-bold text-marfil hover:bg-marron' : 'min-h-[44px] rounded-md border-2 border-error bg-blanco-calido px-4 font-bold text-error'}>
                {texto}
              </button>
            </div>
          </form>
        </details>
      ))}
    </div>
  );
}

function Grabacion({ t, zona }: { t: TallerInscripto; zona: string }) {
  const g = t.grabacion;
  if (!g || g.estado === 'no_corresponde' || t.estado === 'cancelado') return null;
  let texto: string;
  if (g.estado === 'publicada' && g.acceso) {
    texto = `Grabación publicada${g.venceEn ? `, disponible hasta el ${fechaCorta(g.venceEn, zona)}` : ''}. El reproductor llega en una próxima etapa.`;
  } else if (g.estado === 'publicada') texto = 'La grabación está publicada, pero esta inscripción no incluye acceso.';
  else if (g.estado === 'retirada') texto = 'La grabación fue retirada.';
  else if (g.estado === 'no_disponible') texto = 'La grabación no está disponible.';
  else if (t.terminaEn.getTime() > Date.now()) return null;
  else texto = 'Grabación en preparación: se publica solo después de revisarla, con la maestra y sus materiales.';
  return <p className="m-0 mt-2 text-[15px] text-tinta-suave">{texto}</p>;
}

function Fila({ t, zona, pasado }: { t: TallerInscripto; zona: string; pasado: boolean }) {
  const activa = t.inscripcion === 'confirmada' && t.estado === 'publicado';
  const pendiente = activa && t.respuesta === 'pendiente';
  const futuro = t.iniciaEn.getTime() > Date.now();
  const cancelable = !t.paga && t.iniciaEn.getTime() - t.plazoHoras * HORA > Date.now();
  return (
    <li className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <div className="min-w-0 flex-[1_1_320px]">
        <h2 className="m-0 font-texto text-[20px] font-bold">{t.titulo}</h2>
        <p className="m-0 mt-1 text-tinta-suave">{formatearHorario(t.iniciaEn, t.zonaHoraria, zona)}</p>
        <Estado t={t} zona={zona} />
        <Grabacion t={t} zona={zona} />
      </div>
      {!pasado && pendiente && futuro && <Responder t={t} />}
      {!pasado && activa && !pendiente && (
        <div className="flex flex-col items-start gap-3">
          {t.enlace && (
            <div className="flex flex-col items-start gap-1">
              <EnlaceBoton href={t.enlace} tamano="compacto">Entrar a la videollamada</EnlaceBoton>
              <span className="text-[14px] text-tinta-suave">El enlace es personal: no lo comparta.</span>
            </div>
          )}
          {futuro && (t.paga ? (
            <p className="m-0 max-w-[300px] text-[15px] text-tinta-suave">
              Para cancelar o pedir una devolución, <Link href="/contacto" className="font-bold text-oliva-profundo underline underline-offset-4">escriba a la academia</Link>.
            </p>
          ) : cancelable ? (
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
          ) : (
            <p className="m-0 max-w-[300px] text-[15px] text-tinta-suave">Se podía cancelar hasta {t.plazoHoras === 1 ? '1 hora' : `${t.plazoHoras} horas`} antes. Si no puede asistir, escriba a la academia.</p>
          ))}
        </div>
      )}
    </li>
  );
}

export default async function MisTalleres({ searchParams }: Props) {
  const [talleres, avisos, perfil, { aviso }, config] = await Promise.all([misTalleres(), misAvisos(), miPerfil(), searchParams, configuracion()]);
  const ahora = Date.now();
  const proximos = talleres.filter((t) => t.terminaEn.getTime() >= ahora);
  const pasados = talleres.filter((t) => t.terminaEn.getTime() < ahora).reverse();
  const porId = new Map(talleres.map((t) => [t.id, t]));
  return (
    <>
      <EncabezadoCampus titulo="Mis talleres" bajada="Los horarios se muestran en la hora del taller y, si vive en otra zona, también en la suya." />
      <Contenedor className="flex flex-col gap-10 pb-20 pt-2">
        {aviso && AVISOS_OK[aviso] && <Aviso tipo="ok">{AVISOS_OK[aviso]}</Aviso>}
        {aviso && AVISOS_ERROR[aviso] && <Aviso tipo="error">{AVISOS_ERROR[aviso]}</Aviso>}
        {avisos.length > 0 && (
          <section aria-labelledby="avisos" className="max-w-[860px] rounded-2xl bg-arena p-6">
            <h2 id="avisos" className="m-0 text-[22px]">Avisos</h2>
            <ul className="m-0 mt-3 flex list-disc flex-col gap-1.5 pl-5">
              {avisos.map((a) => <li key={a.id}>{textoAviso(a, porId)}</li>)}
            </ul>
            <form action={marcarAvisosLeidos} className="mt-3">
              {avisos.map((a) => <input key={a.id} type="hidden" name="aviso" value={a.id} />)}
              <button type="submit" className="min-h-[44px] px-1 font-bold text-oliva-profundo underline underline-offset-4">Marcar como leídos</button>
            </form>
            <p className="m-0 mt-2 text-[14px] text-tinta-suave">Por ahora no enviamos correos: los avisos quedan aquí.</p>
          </section>
        )}
        {proximos.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {proximos.map((t) => <Fila key={t.id} t={t} zona={perfil.zonaHoraria} pasado={false} />)}
          </ul>
        ) : (
          <div className="max-w-[640px] rounded-2xl bg-arena p-8">
            <p className="m-0 font-display text-2xl">No tiene talleres próximos.</p>
            {config.talleresPublicos
              ? <div className="mt-4"><EnlaceAccion href="/talleres">Ver los talleres en vivo</EnlaceAccion></div>
              : <p className="m-0 mt-2 text-[15px] text-tinta-suave">Los talleres en vivo se abrirán más adelante.</p>}
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
