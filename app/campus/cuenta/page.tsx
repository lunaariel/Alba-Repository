import type { Metadata } from 'next';
import Link from 'next/link';
import { miPerfil } from '@/datos/campus';
import { Contenedor } from '@/ui/estructura';
import { EncabezadoCampus } from '@/ui/campus';
import { FormularioContrasena, FormularioDatos } from './FormulariosCuenta';

export const metadata: Metadata = { title: 'Cuenta' };

// Zonas frecuentes de quienes estudian en Albor; la actual siempre se incluye.
const ZONAS = [
  ['America/Guatemala', 'Guatemala'], ['America/El_Salvador', 'El Salvador'], ['America/Tegucigalpa', 'Honduras'],
  ['America/Managua', 'Nicaragua'], ['America/Costa_Rica', 'Costa Rica'], ['America/Panama', 'Panamá'],
  ['America/Mexico_City', 'México (centro)'], ['America/Bogota', 'Colombia'], ['America/Lima', 'Perú'],
  ['America/Guayaquil', 'Ecuador'], ['America/Caracas', 'Venezuela'], ['America/Santo_Domingo', 'República Dominicana'],
  ['America/Puerto_Rico', 'Puerto Rico'], ['America/La_Paz', 'Bolivia'], ['America/Santiago', 'Chile'],
  ['America/Asuncion', 'Paraguay'], ['America/Argentina/Buenos_Aires', 'Argentina'], ['America/Montevideo', 'Uruguay'],
  ['America/New_York', 'Estados Unidos (este)'], ['America/Chicago', 'Estados Unidos (centro)'],
  ['America/Denver', 'Estados Unidos (montaña)'], ['America/Los_Angeles', 'Estados Unidos (pacífico)'],
  ['Europe/Madrid', 'España'], ['UTC', 'Tiempo universal (UTC)'],
] as const;

export default async function Cuenta() {
  const perfil = await miPerfil();
  const zonas: { valor: string; texto: string }[] = ZONAS.map(([valor, texto]) => ({ valor, texto }));
  if (!zonas.some((z) => z.valor === perfil.zonaHoraria)) zonas.unshift({ valor: perfil.zonaHoraria, texto: perfil.zonaHoraria });
  return (
    <>
      <EncabezadoCampus titulo="Cuenta" bajada={<>Ingresa con <strong className="text-marron">{perfil.correo}</strong>.</>} />
      <Contenedor className="flex flex-wrap gap-x-16 gap-y-12 pb-20 pt-2">
        <section aria-labelledby="datos" className="min-w-0 max-w-[520px] flex-[1_1_360px]">
          <h2 id="datos" className="m-0 mb-5 text-[24px]">Sus datos</h2>
          <FormularioDatos nombre={perfil.nombre} zona={perfil.zonaHoraria} zonas={zonas} />
        </section>
        <section aria-labelledby="clave" className="min-w-0 max-w-[520px] flex-[1_1_360px]">
          <h2 id="clave" className="m-0 mb-5 text-[24px]">Contraseña</h2>
          <FormularioContrasena />
        </section>
        <section aria-labelledby="privacidad" className="min-w-0 max-w-[1080px] flex-[1_1_100%] rounded-2xl bg-arena p-6">
          <h2 id="privacidad" className="m-0 text-[22px]">Sus datos personales</h2>
          <p className="m-0 mt-2 max-w-[44em]">
            Para cambiar su correo, pedir una copia de sus datos o cerrar su cuenta, escríbanos desde{' '}
            <Link href="/contacto" className="font-bold text-oliva-profundo">contacto</Link>. Lo atendemos personalmente.
          </p>
        </section>
      </Contenedor>
    </>
  );
}
