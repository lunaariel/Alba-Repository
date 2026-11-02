import { ConfirmarAccion } from './ConfirmarAccion';

/**
 * Bloqueo excepcional de contenido publicado (erróneo o dañino). A diferencia de retirar,
 * afecta a todas las versiones: deja de mostrarse y deja de contar como requisito.
 * Exige motivo, confirmación escrita y queda en el registro de actividad.
 */
export function BloqueoExcepcional(props: {
  accion: (datos: FormData) => void | Promise<void>;
  tabla: 'lecciones' | 'preguntas' | 'recursos_leccion';
  id: string; volver: string; nombre: string; tipo: string;
  bloqueada: boolean; motivo: string | null;
}) {
  const campos = { tabla: props.tabla, id: props.id, volver: props.volver, bloquear: props.bloqueada ? 'no' : 'si' };
  return (
    <section aria-label="Bloqueo excepcional" className="mt-6 rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
      <h3 className="m-0 text-[20px]">Bloqueo excepcional</h3>
      {props.bloqueada ? (
        <p className="m-0 mt-2 text-[15px]"><b>Bloqueada en todas las versiones.</b> Motivo registrado: {props.motivo}</p>
      ) : (
        <p className="m-0 mt-2 text-[15px] text-tinta-suave">
          Solo para contenido erróneo o dañino que no puede seguir visible ni siquiera para quienes siguen versiones anteriores.
          Para cambios normales, retírela del borrador y publique una versión nueva.
        </p>
      )}
      <div className="mt-3">
        <ConfirmarAccion
          reforzada accion={props.accion} campos={campos} estilo={props.bloqueada ? 'secundario' : 'peligro'} peligro={!props.bloqueada}
          textoBoton={props.bloqueada ? 'Desbloquear' : `Bloquear ${props.tipo}`}
          titulo={props.bloqueada ? `¿Desbloquear ${props.tipo}?` : `¿Bloquear ${props.tipo} en todas las versiones?`}
          palabra={props.bloqueada ? 'DESBLOQUEAR' : 'BLOQUEAR'}
        >
          {props.bloqueada ? (
            <p className="m-0">«{props.nombre}» vuelve a mostrarse en las versiones que la incluyen y vuelve a contar como requisito.</p>
          ) : (
            <>
              <p className="m-0">«{props.nombre}» deja de mostrarse a todos los alumnos, en todas las versiones, y deja de contar como requisito para terminar el curso.</p>
              <p className="m-0">El avance, los intentos y los certificados ya emitidos no cambian.</p>
            </>
          )}
          <label htmlFor={`motivo-${props.id}`} className="mt-2 text-[15px] font-bold">Motivo (queda registrado)</label>
          <textarea id={`motivo-${props.id}`} name="motivo" required minLength={10} maxLength={500} rows={3}
            className="rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-4 py-3 text-marron" />
        </ConfirmarAccion>
      </div>
    </section>
  );
}
