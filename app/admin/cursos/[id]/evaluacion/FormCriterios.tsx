'use client';

import { useActionState, useState } from 'react';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { AreaTexto, Entrada } from '@/ui/admin/campos';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import {
  configCoherente, consecuenciasCambio, faltaCriterioCertificacion, requisitosParaAlumno, type ConfigEvaluacion, type Modalidad,
} from '@/dominio/evaluacion';
import { guardarCriterios, type Estado } from '../../acciones';

const casilla = 'mt-1 h-5 w-5 shrink-0 accent-[#4E6049]';

/**
 * Forma de evaluar el curso: evaluación final con puntaje (sumativa) o formativa, con sus requisitos de
 * finalización. Muestra en vivo lo que verá el alumno y las consecuencias frente a la versión vigente.
 */
export function FormCriterios({ curso, criterios, config, vigente, conIntentos, versionado = false }: {
  curso: string;
  criterios: { puntaje: string; intentos: string; aprobado: string; desaprobado: string };
  config: ConfigEvaluacion;
  vigente: ConfigEvaluacion | null;
  conIntentos: boolean;
  versionado?: boolean;
}) {
  const [estado, accion] = useActionState<Estado, FormData>(guardarCriterios, undefined);
  const [modalidad, setModalidad] = useState<Modalidad>(config.modalidad);
  const [actividades, setActividades] = useState(config.requiereActividades);
  const [validacion, setValidacion] = useState(config.requiereValidacion);
  const [certificado, setCertificado] = useState(config.conCertificado);
  const [puntaje, setPuntaje] = useState(criterios.puntaje);
  const [intentos, setIntentos] = useState(criterios.intentos);
  const err = (c: string) => (estado?.campo === c ? estado.error : undefined);

  const borrador = configCoherente({
    modalidad, requiereActividades: actividades, requiereValidacion: validacion, conCertificado: certificado,
    puntajeMinimo: Number(puntaje) || 0, intentosPermitidos: intentos.trim() === '' ? null : Number(intentos) || null,
  });
  const consecuencias = consecuenciasCambio(vigente, borrador);

  return (
    <section aria-labelledby="criterios" className="flex flex-col gap-5">
      <div className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
        <h2 id="criterios" className="m-0 text-[22px]">Cómo se termina el curso</h2>
        <form action={accion} className="mt-4 flex flex-col gap-4">
          <GuardiaCambios />
          <input type="hidden" name="curso" value={curso} />
          {estado?.error && !estado.campo && <Aviso tipo="error">{estado.error}</Aviso>}
          {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 font-bold">Forma de evaluar</legend>
            <label className="flex items-start gap-2.5">
              <input type="radio" name="modalidad" value="sumativa" checked={modalidad === 'sumativa'} onChange={() => setModalidad('sumativa')} className={casilla} />
              <span><b>Evaluación final con puntaje</b><span className="block text-[14px] text-tinta-suave">Un cuestionario corregido automáticamente, con puntaje mínimo e intentos.</span></span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="radio" name="modalidad" value="formativa" checked={modalidad === 'formativa'} onChange={() => setModalidad('formativa')} className={casilla} />
              <span><b>Evaluación formativa</b><span className="block text-[14px] text-tinta-suave">Acompaña el aprendizaje sin nota. Usted elige qué hace falta para terminar.</span></span>
            </label>
          </fieldset>

          <div hidden={modalidad !== 'sumativa'} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Entrada nombre="puntaje" etiqueta="Puntaje mínimo (0 a 100)" inputMode="numeric" value={puntaje} onChange={(e) => setPuntaje(e.target.value)} required error={err('puntaje')} />
              <Entrada nombre="intentos" etiqueta="Intentos permitidos" inputMode="numeric" value={intentos} onChange={(e) => setIntentos(e.target.value)} placeholder="Sin límite" error={err('intentos')} />
            </div>
            <AreaTexto nombre="aprobado" etiqueta="Mensaje al aprobar" defaultValue={criterios.aprobado} rows={2} maxLength={300} error={err('aprobado')} />
            <AreaTexto nombre="desaprobado" etiqueta="Mensaje al no aprobar" defaultValue={criterios.desaprobado} rows={2} maxLength={300} error={err('desaprobado')} />
          </div>

          <fieldset hidden={modalidad !== 'formativa'} className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-1 font-bold">Para terminar el curso, además de completar las lecciones:</legend>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="actividades" value="si" checked={actividades} onChange={(e) => setActividades(e.target.checked)} className={casilla} />
              <span>Responder las actividades formativas <span className="block text-[14px] text-tinta-suave">Las preguntas de esta pestaña, sin nota ni mínimo: el alumno recibe temas para repasar.</span></span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="validacion" value="si" checked={validacion} onChange={(e) => setValidacion(e.target.checked)} className={casilla} />
              <span>Mi validación como docente <span className="block text-[14px] text-tinta-suave">Usted confirma la finalización de cada alumno desde la pestaña Alumnos, con una nota.</span></span>
            </label>
            <label className="mt-1 flex items-start gap-2.5">
              <input type="checkbox" name="certificado" value="si" checked={certificado} onChange={(e) => setCertificado(e.target.checked)} className={casilla} />
              <span>El curso entrega certificado de finalización</span>
            </label>
            {faltaCriterioCertificacion(borrador) && (
              <p role="alert" className="m-0 rounded-lg border-[1.5px] border-[#D9C48C] bg-[#F5EBCF] px-3 py-2 text-[14px] text-[#6B5420]">
                Para entregar certificado, elija al menos un criterio además de las lecciones. Abrir páginas o marcar lecciones no alcanza.
                Mientras tanto, el curso no se puede publicar.
              </p>
            )}
          </fieldset>

          {versionado
            ? <p className="m-0 text-[14px] text-tinta-suave">Configuración del borrador: rige desde la próxima versión publicada. Cada versión conserva la suya.</p>
            : conIntentos && <p className="m-0 text-[14px] text-tinta-suave">Los cambios valen desde el próximo intento; los anteriores no se recalculan.</p>}
          <div><BotonEnviar>Guardar criterios</BotonEnviar></div>
        </form>
      </div>

      {consecuencias.length > 0 && (
        <div aria-live="polite" className="rounded-2xl border-[1.5px] border-[#D9C48C] bg-[#F5EBCF] p-5 text-[15px] text-[#4F3E16]">
          <h3 className="m-0 text-[18px]">Qué cambia</h3>
          <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5">{consecuencias.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}

      <div aria-live="polite" className="rounded-2xl bg-arena p-5">
        <h3 className="m-0 text-[18px]">Vista previa: lo que verá el alumno</h3>
        <p className="m-0 mt-1 text-[14px] text-tinta-suave">En la página del curso, bajo «Para terminar el curso»:</p>
        <ol className="m-0 mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[15px]">{requisitosParaAlumno(borrador).map((l) => <li key={l}>{l}</li>)}</ol>
      </div>
    </section>
  );
}
