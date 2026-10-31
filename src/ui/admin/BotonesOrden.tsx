import { moverElemento } from '../../../app/admin/cursos/acciones';

/** Flechas para subir o bajar un elemento (accesibles con teclado; sin arrastrar). */
export function BotonesOrden({ tabla, id, curso, volver, nombre, primero, ultimo }: {
  tabla: 'modulos' | 'lecciones' | 'preguntas'; id: string; curso: string; volver: string; nombre: string; primero: boolean; ultimo: boolean;
}) {
  const boton = (direccion: '-1' | '1', etiqueta: string, simbolo: string, deshabilitado: boolean) => (
    <form action={moverElemento}>
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="curso" value={curso} />
      <input type="hidden" name="volver" value={volver} />
      <input type="hidden" name="direccion" value={direccion} />
      <button type="submit" disabled={deshabilitado} aria-label={`${etiqueta}: ${nombre}`}
        className="flex h-[28px] w-[34px] items-center justify-center rounded-md border-[1.5px] border-borde-bandeja bg-marfil text-[12px] text-tinta-suave hover:bg-arena disabled:opacity-35">
        <span aria-hidden="true">{simbolo}</span>
      </button>
    </form>
  );
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {boton('-1', 'Subir', '▲', primero)}
      {boton('1', 'Bajar', '▼', ultimo)}
    </div>
  );
}
