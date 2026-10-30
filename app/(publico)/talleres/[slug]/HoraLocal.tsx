'use client';

import { useEffect, useState } from 'react';

/** Muestra la hora en la zona del visitante, solo si es distinta de la del taller. Se calcula en el navegador. */
export function HoraLocal({ inicio, zonaTaller }: { inicio: string; zonaTaller: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zona || zona === zonaTaller) return;
    const hora = new Intl.DateTimeFormat('es', { timeZone: zona, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(inicio));
    setTexto(`En su zona horaria: ${hora}.`);
  }, [inicio, zonaTaller]);
  return texto ? <p className="m-0 mt-1 text-[15px] text-tinta-suave">{texto}</p> : null;
}
