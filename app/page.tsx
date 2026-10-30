import Link from 'next/link';

// Página provisoria. El inicio de la propuesta B se implementa en la Fase 3.
export default function Inicio() {
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[48px] leading-tight">Albor</h1>
      <p className="m-0">El sitio está en construcción.</p>
      <p className="m-0">
        <Link href="/ingresar" className="font-bold text-oliva-profundo underline underline-offset-4">Ingresar</Link>
      </p>
    </main>
  );
}
