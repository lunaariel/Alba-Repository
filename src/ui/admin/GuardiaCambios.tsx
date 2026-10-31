'use client';

import { useEffect, useRef } from 'react';

/**
 * Colocado dentro de un formulario: si hay cambios sin guardar, el navegador pregunta antes de
 * salir de la página. Al enviar el formulario, deja de preguntar.
 */
export function GuardiaCambios() {
  const marca = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = marca.current?.closest('form');
    if (!form) return;
    let sucio = false;
    const cambiar = () => { sucio = true; };
    const limpiar = () => { sucio = false; };
    const antesDeSalir = (e: BeforeUnloadEvent) => { if (sucio) { e.preventDefault(); e.returnValue = ''; } };
    form.addEventListener('input', cambiar);
    form.addEventListener('submit', limpiar);
    window.addEventListener('beforeunload', antesDeSalir);
    return () => {
      form.removeEventListener('input', cambiar);
      form.removeEventListener('submit', limpiar);
      window.removeEventListener('beforeunload', antesDeSalir);
    };
  }, []);
  return <span ref={marca} hidden />;
}
