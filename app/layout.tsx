import type { Metadata } from 'next';
import { Atkinson_Hyperlegible, Fraunces } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  variable: '--fuente-fraunces',
  display: 'swap',
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--fuente-atkinson',
  display: 'swap',
});

// El nombre visible sale de configuracion_academia en las páginas; este es el valor por defecto.
export const metadata: Metadata = {
  title: { default: 'Albor', template: '%s · Albor' },
  description: 'Academia de primera infancia creada por una maestra, para familias, docentes y cuidadores.',
  icons: { icon: '/marca/albor-favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${atkinson.variable}`}>
      <body>{children}</body>
    </html>
  );
}
