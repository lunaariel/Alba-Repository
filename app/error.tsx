'use client';

import Link from 'next/link';

/**
 * Error inesperado en una página. No muestra detalles internos (en producción Next ya los oculta): solo un mensaje
 * claro, la opción de reintentar y un código de referencia para pedir ayuda.
 */
export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-5 py-16" role="alert">
      <h1 className="m-0 text-[36px] leading-tight">Algo no salió bien</h1>
      <p className="m-0">No pudimos mostrar esta página. Su información está a salvo: puede intentar de nuevo en unos segundos.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="min-h-[48px] rounded-md bg-oliva-profundo px-5 font-bold text-marfil hover:bg-marron">Intentar de nuevo</button>
        <Link href="/" className="inline-flex min-h-[48px] items-center rounded-md border-2 border-oliva-profundo px-5 font-bold text-oliva-profundo no-underline hover:bg-arena">Ir al inicio</Link>
      </div>
      {error.digest && <p className="m-0 text-[14px] text-tinta-suave">Si el problema sigue, escríbanos desde Contacto e indique este código: <span className="font-mono">{error.digest}</span></p>}
    </main>
  );
}
