/** Completa una plantilla {{variable}}. Una variable faltante es un error (no se envía un correo a medias). */
export function completarPlantilla(texto: string, variables: Record<string, unknown>): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, nombre: string) => {
    const valor = variables[nombre];
    if (valor === undefined || valor === null || String(valor).trim() === '') throw new Error(`variable_faltante:${nombre}`);
    // Texto plano: se quitan saltos de control que podrían inyectar cabeceras.
    return String(valor).replace(/[\r\n\t]+/g, ' ').slice(0, 500);
  });
}
