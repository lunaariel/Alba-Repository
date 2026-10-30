import type { Metadata } from 'next';
import { configuracion } from '@/datos/publico';
import { enlaceWhatsApp } from '@/contenido/textos';
import { Contenedor } from '@/ui/estructura';
import { FormularioContacto } from './FormularioContacto';

export const metadata: Metadata = {
  title: 'Contacto',
  description: 'Escríbale a Albor por formulario, correo o WhatsApp.',
  alternates: { canonical: '/contacto' },
};

export default async function Contacto() {
  const config = await configuracion();
  const whatsapp = enlaceWhatsApp(config.whatsapp);
  return (
    <section aria-labelledby="titulo">
      <Contenedor className="flex flex-wrap gap-x-16 gap-y-10 py-[clamp(40px,6vw,88px)]">
        <div className="min-w-0 flex-[1_1_320px]">
          <h1 id="titulo" className="m-0 text-[clamp(36px,4vw,56px)] leading-[1.1]">Contacto</h1>
          <p className="m-0 mt-4 max-w-[30em] text-lg">¿Tiene una consulta sobre los cursos o los talleres? Escríbanos y le respondemos por correo.</p>
          {(config.correoContacto || whatsapp) && (
            <ul className="m-0 mt-8 flex list-none flex-col gap-3 p-0 text-lg">
              {config.correoContacto && (
                <li>Correo: <a href={`mailto:${config.correoContacto}`} className="font-bold text-oliva-profundo underline underline-offset-4">{config.correoContacto}</a></li>
              )}
              {whatsapp && (
                <li>WhatsApp: <a href={whatsapp} rel="noopener" className="font-bold text-oliva-profundo underline underline-offset-4">escribir por WhatsApp</a></li>
              )}
            </ul>
          )}
        </div>
        <div className="relative min-w-0 flex-[1_1_420px] rounded-2xl bg-arena p-[clamp(20px,3vw,36px)]">
          <FormularioContacto />
        </div>
      </Contenedor>
    </section>
  );
}
