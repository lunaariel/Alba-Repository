'use client';

export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-[44px] rounded-sm border-2 border-oliva-profundo bg-marfil px-[18px] font-bold text-oliva-profundo">
      Imprimir o guardar en PDF
    </button>
  );
}
