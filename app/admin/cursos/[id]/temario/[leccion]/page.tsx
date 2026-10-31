import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cursoAdmin } from '@/datos/admin-cursos';
import { AvisoAccion } from '@/ui/admin/campos';
import { EstadoChip } from '@/ui/admin/estructura';
import { ConfirmarAccion } from '@/ui/admin/ConfirmarAccion';
import { quitarMaterial } from '../../../acciones';
import { FormLeccion } from './FormLeccion';
import { SubirMaterial } from './SubirMaterial';

export const metadata: Metadata = { title: 'Lección' };

type Props = { params: Promise<{ id: string; leccion: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const peso = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function EditarLeccion({ params, searchParams }: Props) {
  const [{ id, leccion }, aviso] = await Promise.all([params, searchParams]);
  const c = await cursoAdmin(id);
  const modulo = c?.modulos.find((m) => m.lecciones.some((l) => l.id === leccion));
  const l = modulo?.lecciones.find((x) => x.id === leccion);
  if (!c || !modulo || !l) notFound();
  const volver = `/admin/cursos/${c.id}/temario/${l.id}`;
  return (
    <>
      <Link href={`/admin/cursos/${c.id}/temario`} className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 font-bold text-oliva-profundo no-underline hover:underline">
        <span aria-hidden="true">←</span> Volver al temario
      </Link>
      <AvisoAccion ok={aviso.ok} error={aviso.error} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-[26px]">{l.titulo}</h2>
        {l.retirada && <EstadoChip estado="archivado" texto="Retirada" />}
        <span className="text-[15px] text-tinta-suave">Módulo: {modulo.titulo}{l.vistas > 0 ? ` · vista por ${l.vistas}, completada por ${l.completadas}` : ''}</span>
      </div>
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_380px]">
        <FormLeccion leccion={{ id: l.id, curso: c.id, titulo: l.titulo, descripcion: l.descripcion ?? '', duracion: l.duracionMinutos ? String(l.duracionMinutos) : '', video: l.videoId ?? '' }} />
        <section aria-labelledby="materiales" className="rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-6">
          <h3 id="materiales" className="m-0 text-[22px]">Materiales PDF</h3>
          <p className="m-0 mt-1 text-[14px] text-tinta-suave">Solo los descargan los alumnos del curso, con un enlace que vence en minutos.</p>
          {l.materiales.length > 0 ? (
            <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
              {l.materiales.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-marfil px-3 py-2">
                  <span><b>{m.titulo}</b> <span className="text-[13.5px] text-tinta-suave">· {peso(m.tamanoBytes)}</span></span>
                  <ConfirmarAccion accion={quitarMaterial} campos={{ id: m.id, volver }} textoBoton="Quitar" titulo="¿Quitar el material?" estilo="enlacePeligro" peligro textoConfirmar="Quitar">
                    <p className="m-0">«{m.titulo}» deja de estar disponible para los alumnos y el archivo se borra.</p>
                  </ConfirmarAccion>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-4">Esta lección todavía no tiene materiales.</p>
          )}
          <SubirMaterial leccionId={l.id} />
        </section>
      </div>
    </>
  );
}
