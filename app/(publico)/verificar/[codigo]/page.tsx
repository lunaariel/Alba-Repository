import type { Metadata } from 'next';
import { clientePublico } from '@/datos/supabase';
import { Contenedor } from '@/ui/estructura';
import { EnlaceAccion } from '@/ui/acciones';

export const metadata: Metadata = { title: 'Verificación de certificado', robots: { index: false } };

type Resultado = { nombre: string; curso: string; emitido_en: string; codigo: string } | null;

export default async function ResultadoVerificacion({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = decodeURIComponent((await params).codigo).replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, 12);
  const { data } = await clientePublico().rpc('verificar_certificado', { p_codigo: codigo });
  const c = data as Resultado;
  const fecha = c && new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' })
    .format(new Date(c.emitido_en));
  return (
    <section aria-labelledby="titulo" className="bg-marfil">
      <Contenedor className="py-[clamp(48px,7vw,96px)]">
        <div className="max-w-[720px] rounded-2xl border-[1.5px] border-borde-bandeja bg-blanco-calido p-[clamp(24px,4vw,44px)]">
          {c ? (
            <>
              <p className="m-0 font-bold text-oliva-profundo">Certificado válido</p>
              <h1 id="titulo" className="m-0 mt-2 text-[clamp(30px,3.6vw,44px)] leading-[1.1]">{c.nombre}</h1>
              <p className="m-0 mt-4 text-lg">completó el curso <strong>{c.curso}</strong> y aprobó su evaluación final.</p>
              <p className="m-0 mt-2 text-tinta-suave">Emitido el {fecha} · Código {c.codigo}</p>
              <p className="m-0 mt-6 border-t border-borde-bandeja pt-4 text-[15px] text-tinta-suave">
                Es un certificado de finalización emitido por Albor. No es una acreditación Montessori oficial.
              </p>
            </>
          ) : (
            <>
              <h1 id="titulo" className="m-0 text-[clamp(28px,3.4vw,40px)] leading-[1.1]">No encontramos ese certificado</h1>
              <p className="m-0 mt-3 text-lg">Revise el código ({codigo || 'vacío'}). Tiene 12 caracteres, entre letras y números.</p>
            </>
          )}
          <div className="mt-6"><EnlaceAccion href="/verificar">Verificar otro código</EnlaceAccion></div>
        </div>
      </Contenedor>
    </section>
  );
}
