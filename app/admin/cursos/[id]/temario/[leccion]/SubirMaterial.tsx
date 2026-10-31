'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Aviso } from '@/ui/Formulario';
import { confirmarSubida, prepararSubida } from '../../../acciones';

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const CLAVE_ANONIMA = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Subida directa al almacenamiento privado con una URL firmada por el servidor, con barra de progreso. */
function subir(ruta: string, token: string, archivo: File, alAvanzar: (p: number) => void): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    const url = `${URL_SUPABASE}/storage/v1/object/upload/sign/materiales/${ruta}?token=${encodeURIComponent(token)}`;
    xhr.open('PUT', url);
    xhr.setRequestHeader('apikey', CLAVE_ANONIMA);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) alAvanzar(Math.round((100 * e.loaded) / e.total)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolver() : rechazar(new Error(String(xhr.status))));
    xhr.onerror = () => rechazar(new Error('red'));
    const cuerpo = new FormData();
    cuerpo.append('cacheControl', '3600');
    cuerpo.append('', archivo);
    xhr.send(cuerpo);
  });
}

export function SubirMaterial({ leccionId }: { leccionId: string }) {
  const router = useRouter();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState('');
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(false);
    const archivo = archivoRef.current?.files?.[0];
    if (!archivo) return setError('Elija un archivo PDF.');
    if (archivo.size > 25 * 1024 * 1024) return setError('El PDF debe pesar como máximo 25 MB.');
    const nombre = titulo.trim() || archivo.name.replace(/\.pdf$/i, '');
    const preparado = await prepararSubida(leccionId, archivo.name, archivo.size);
    if ('error' in preparado) return setError(preparado.error);
    try {
      setProgreso(0);
      await subir(preparado.ruta, preparado.token, archivo, setProgreso);
    } catch {
      setProgreso(null);
      return setError('No se pudo subir el archivo. Revise la conexión e intente de nuevo.');
    }
    const r = await confirmarSubida(leccionId, preparado.ruta, nombre);
    setProgreso(null);
    if ('error' in r) return setError(r.error);
    setOk(true); setTitulo('');
    if (archivoRef.current) archivoRef.current.value = '';
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="mt-5 flex flex-col gap-3 border-t border-borde-bandeja pt-5">
      <p className="m-0 font-bold">Agregar un PDF</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">Material agregado.</Aviso>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pdf" className="text-[15px] font-bold">Archivo (PDF, hasta 25 MB)</label>
        <input id="pdf" ref={archivoRef} type="file" accept="application/pdf,.pdf" required className="min-h-[44px] text-[15px]" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pdf-titulo" className="text-[15px] font-bold">Nombre para los alumnos</label>
        <input id="pdf-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} placeholder="Si lo deja vacío, se usa el nombre del archivo"
          className="min-h-[48px] rounded-md border-[1.5px] border-borde-control bg-blanco-calido px-3 text-marron" />
      </div>
      {progreso !== null && (
        <div role="progressbar" aria-label="Subiendo el PDF" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso} className="h-2.5 overflow-hidden rounded-full bg-arena">
          <div className="h-full bg-oliva-profundo transition-[width]" style={{ width: `${progreso}%` }} />
        </div>
      )}
      <div>
        <button type="submit" disabled={progreso !== null} className="min-h-[46px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron disabled:opacity-55">
          {progreso !== null ? `Subiendo… ${progreso} %` : 'Subir PDF'}
        </button>
      </div>
    </form>
  );
}
