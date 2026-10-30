import Link from 'next/link';

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-5 px-5 py-24">
      <h1 className="m-0 text-[44px] leading-tight">No encontramos esta página</h1>
      <p className="m-0 text-lg">Puede que el enlace haya cambiado o que el contenido todavía no esté publicado.</p>
      <p className="m-0">
        <Link href="/" className="font-bold text-oliva-profundo underline underline-offset-4">Volver al inicio</Link>
      </p>
    </main>
  );
}
