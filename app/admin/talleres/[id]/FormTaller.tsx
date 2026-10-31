'use client';

import { startTransition, useActionState, useState } from 'react';
import { Aviso } from '@/ui/Formulario';
import { AreaTexto, Entrada, Selector } from '@/ui/admin/campos';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import { ZONAS_TALLER } from '@/dominio/talleres';
import { guardarTaller, type EstadoForm } from '../acciones';

export interface DatosFormTaller {
  id: string; titulo: string; slug: string; descripcion: string; zona: string; fecha: string; hora: string; duracion: string;
  gratuito: boolean; precio: string; ilimitado: boolean; cupo: string; plataforma: 'zoom' | 'meet'; visible: string;
  fechaEditable: boolean; cerrado: boolean; minimoCupo: number;
}

export function FormTaller({ t, vistaPrevia }: { t: DatosFormTaller; vistaPrevia: string }) {
  const [estado, accion, enviando] = useActionState<EstadoForm, FormData>(guardarTaller, undefined);
  const [tipo, setTipo] = useState(t.gratuito ? 'gratuito' : 'pago');
  const [cupoTipo, setCupoTipo] = useState(t.ilimitado ? 'ilimitado' : 'limitado');
  const err = (c: string) => (estado?.campo === c ? estado.error : undefined);
  const radio = 'mt-0.5 h-5 w-5 shrink-0 accent-[#4E6049]';
  return (
    // Envío sin el reinicio automático del formulario de React 19: los radios controlados quedarían
    // desfasados de lo guardado (se vio en las capturas).
    <form
      onSubmit={(e) => { e.preventDefault(); const datos = new FormData(e.currentTarget); startTransition(() => accion(datos)); }}
      className="flex max-w-[860px] flex-col gap-6"
    >
      <GuardiaCambios />
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="conFecha" value={t.fechaEditable ? 'si' : 'no'} />
      {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      {t.cerrado && <p className="m-0 rounded-xl bg-arena px-5 py-3.5 text-[15px]">El taller está cerrado (cancelado, finalizado o archivado): se conservan sus datos; fecha, cupo y precio ya no cambian.</p>}

      <fieldset className="m-0 flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 font-display text-[22px] font-semibold">Presentación</legend>
        <Entrada nombre="titulo" etiqueta="Título" defaultValue={t.titulo} required maxLength={140} error={err('titulo')} />
        <Entrada nombre="slug" etiqueta="Dirección web" defaultValue={t.slug} required maxLength={60} error={err('slug')}
          ayuda={<>Se ve en albor…/talleres/<b>{t.slug}</b>.</>} />
        <AreaTexto nombre="descripcion" etiqueta="Descripción" defaultValue={t.descripcion} rows={6} maxLength={8000} error={err('descripcion')}
          ayuda="Qué se trabajará y para quién es. Separe los párrafos con una línea en blanco." />
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 font-display text-[22px] font-semibold">Fecha y hora</legend>
        <Selector nombre="zona" etiqueta="Zona horaria del taller" defaultValue={t.zona} opciones={ZONAS_TALLER.map((z) => ({ valor: z.valor, texto: z.texto }))} />
        {t.fechaEditable ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Entrada nombre="fecha" etiqueta="Fecha" type="date" defaultValue={t.fecha} required error={err('fecha')} />
            <Entrada nombre="hora" etiqueta="Hora de inicio" type="time" defaultValue={t.hora} required />
            <Entrada nombre="duracion" etiqueta="Duración (minutos)" inputMode="numeric" defaultValue={t.duracion} required error={err('duracion')} />
          </div>
        ) : (
          <p className="m-0 rounded-xl bg-arena px-5 py-3.5 text-[15px]">
            {t.cerrado ? 'La fecha ya no cambia.' : <>Este taller tiene inscriptos o reservas: la fecha se cambia con <b>Reprogramar</b>, en la pestaña Estado. Pide motivo y deja registrado el aviso a cada persona.</>}
          </p>
        )}
        <p className="m-0 text-[15px]"><b>Se ve como:</b> {vistaPrevia}</p>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-1 font-display text-[22px] font-semibold">Precio y cupo</legend>
        <div className="flex flex-wrap gap-x-8 gap-y-2" role="radiogroup" aria-label="Precio">
          <label className="flex min-h-[44px] items-center gap-2.5"><input type="radio" name="tipo" value="gratuito" checked={tipo === 'gratuito'} onChange={() => setTipo('gratuito')} className={radio} />Gratuito</label>
          <label className="flex min-h-[44px] items-center gap-2.5"><input type="radio" name="tipo" value="pago" checked={tipo === 'pago'} onChange={() => setTipo('pago')} className={radio} />Pago</label>
        </div>
        {tipo === 'pago' && (
          <Entrada nombre="precio" etiqueta="Precio en USD" inputMode="decimal" defaultValue={t.precio} placeholder="15" error={err('precio')}
            ayuda="La venta de talleres pagos abre al conectar la pasarela de pago (Fase 6). Los gratuitos admiten inscripción desde ya." />
        )}
        <div className="flex flex-wrap gap-x-8 gap-y-2" role="radiogroup" aria-label="Cupo">
          <label className="flex min-h-[44px] items-center gap-2.5"><input type="radio" name="cupoTipo" value="limitado" checked={cupoTipo === 'limitado'} onChange={() => setCupoTipo('limitado')} className={radio} />Cupo limitado</label>
          <label className="flex min-h-[44px] items-center gap-2.5"><input type="radio" name="cupoTipo" value="ilimitado" checked={cupoTipo === 'ilimitado'} onChange={() => setCupoTipo('ilimitado')} className={radio} />Sin límite de lugares</label>
        </div>
        {cupoTipo === 'limitado' && (
          <Entrada nombre="cupo" etiqueta="Cupo (lugares)" inputMode="numeric" defaultValue={t.cupo} error={err('cupo')}
            ayuda={t.minimoCupo > 0 ? `Mínimo ${t.minimoCupo}: los lugares ya ocupados.` : undefined} />
        )}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-1 font-display text-[22px] font-semibold">Videollamada</legend>
        <Selector nombre="plataforma" etiqueta="Plataforma" defaultValue={t.plataforma} opciones={[{ valor: 'zoom', texto: 'Zoom' }, { valor: 'meet', texto: 'Google Meet' }]} />
        <p className="m-0 text-[14px] text-tinta-suave">El enlace lo ven solo las personas con inscripción confirmada, desde que se confirma; lo controla el servidor.</p>
      </fieldset>
      <div>
        <button type="submit" disabled={enviando} className="min-h-[54px] rounded-md bg-oliva-profundo px-7 text-[17px] font-bold text-marfil transition-colors hover:bg-marron disabled:opacity-55">
          {enviando ? 'Un momento…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
