/**
 * Al arrancar el servidor se valida la configuración del entorno (src/config/validacion.ts). En producción, una
 * configuración incompleta o insegura detiene el arranque con la lista de variables a corregir (nunca sus valores).
 * En desarrollo y pruebas se informa y el servidor sigue.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { validarConfiguracion } = await import('./src/config/validacion');
  const r = validarConfiguracion(process.env);
  if (r.errores.length && r.entorno === 'produccion') {
    console.error(`Configuración de producción incompleta o insegura:\n- ${r.errores.join('\n- ')}`);
    // Termina el proceso (código 1) para que el hosting marque el arranque como fallido; no atiende solicitudes.
    process.exit(1);
  }
  for (const e of r.errores) console.error(`configuración (${r.entorno}): ${e}`);
}
