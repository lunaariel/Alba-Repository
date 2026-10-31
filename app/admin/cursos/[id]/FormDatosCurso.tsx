'use client';

import { useActionState } from 'react';
import { Aviso, BotonEnviar } from '@/ui/Formulario';
import { AreaTexto, Entrada, Selector } from '@/ui/admin/campos';
import { GuardiaCambios } from '@/ui/admin/GuardiaCambios';
import { centavosATexto } from '@/dominio/cursos-admin';
import { guardarDatosCurso, type Estado } from '../acciones';

interface Datos {
  id: string; titulo: string; slug: string; resumen: string; descripcion: string; requisitos: string; objetivos: string;
  publico: string[]; edadDesde: number; edadHasta: number; duracionHoras: string; precioCentavos: number; video: string; estado: string;
}

const EDADES = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ valor: String(n), texto: n === 1 ? '1 año' : `${n} años` }));
const PUBLICOS = [
  { valor: 'familias', texto: 'Familias' },
  { valor: 'docentes', texto: 'Docentes' },
  { valor: 'cuidadores', texto: 'Cuidadores' },
];

export function FormDatosCurso({ curso, alumnos }: { curso: Datos; alumnos: number }) {
  const [estado, accion] = useActionState<Estado, FormData>(guardarDatosCurso, undefined);
  const err = (c: string) => (estado?.campo === c ? estado.error : undefined);
  return (
    <form action={accion} className="flex max-w-[860px] flex-col gap-8">
      <GuardiaCambios />
      <input type="hidden" name="id" value={curso.id} />
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}

      <fieldset className="m-0 flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 font-display text-[22px] font-semibold">Presentación</legend>
        <Entrada nombre="titulo" etiqueta="Título" defaultValue={curso.titulo} required maxLength={140} error={err('titulo')} />
        <Entrada nombre="slug" etiqueta="Dirección web" defaultValue={curso.slug} required maxLength={60} error={err('slug')}
          ayuda={<>El curso se ve en albor…/cursos/<b>{curso.slug}</b>. {curso.estado !== 'borrador' && 'Si la cambia, los enlaces viejos dejan de funcionar.'}</>} />
        <AreaTexto nombre="resumen" etiqueta="Resumen (una o dos frases)" defaultValue={curso.resumen} maxLength={240} rows={2} error={err('resumen')} />
        <AreaTexto nombre="descripcion" etiqueta="Descripción" defaultValue={curso.descripcion} maxLength={8000} rows={6}
          ayuda="Separe los párrafos con una línea en blanco." error={err('descripcion')} />
        <AreaTexto nombre="objetivos" etiqueta="Qué va a aprender (uno por línea)" defaultValue={curso.objetivos} rows={4} error={err('objetivos')} />
        <AreaTexto nombre="requisitos" etiqueta="Requisitos (opcional)" defaultValue={curso.requisitos} rows={2} maxLength={2000} />
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 font-display text-[22px] font-semibold">Para quién</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2" role="group" aria-label="Público">
          {PUBLICOS.map((p) => (
            <label key={p.valor} className="flex min-h-[44px] items-center gap-2.5">
              <input type="checkbox" name="publico" value={p.valor} defaultChecked={curso.publico.includes(p.valor)} className="h-5 w-5 accent-[#4E6049]" />
              {p.texto}
            </label>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <Selector nombre="edadDesde" etiqueta="Edad desde" opciones={EDADES} defaultValue={String(curso.edadDesde)} error={err('edadDesde')} />
          <Selector nombre="edadHasta" etiqueta="Edad hasta" opciones={EDADES} defaultValue={String(curso.edadHasta)} />
          <Entrada nombre="duracionHoras" etiqueta="Duración (horas)" inputMode="decimal" defaultValue={curso.duracionHoras} error={err('duracionHoras')} />
        </div>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 font-display text-[22px] font-semibold">Precio y video</legend>
        <Entrada nombre="precio" etiqueta="Precio en USD" inputMode="decimal" defaultValue={centavosATexto(curso.precioCentavos)} required error={err('precio')}
          ayuda={alumnos > 0 ? `Un precio nuevo vale solo para compras futuras: ${alumnos === 1 ? 'el alumno que ya lo tiene no se ve afectado' : `los ${alumnos} alumnos que ya lo tienen no se ven afectados`}; cada compra conserva su precio.` : 'Por ejemplo 49 o 49.50.'} />
        <Entrada nombre="video" etiqueta="Video de presentación (id de Bunny, biblioteca pública)" defaultValue={curso.video} error={err('video')}
          ayuda="Opcional. Es el video que ve cualquiera en la ficha del curso. La subida desde el panel llega al conectar Bunny." />
      </fieldset>

      <div className="sticky bottom-0 -mx-2 border-t border-borde-bandeja bg-marfil/95 px-2 py-4">
        <BotonEnviar>Guardar cambios</BotonEnviar>
      </div>
    </form>
  );
}
