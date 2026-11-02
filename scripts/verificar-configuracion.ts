// Comprueba la configuración de un entorno sin mostrar ningún valor.
// Uso: npm run configuracion                  (variables del proceso)
//      npm run configuracion -- .env.produccion   (archivo KEY=valor; no se sube al repositorio)
import { readFileSync } from 'node:fs';
import { validarConfiguracion } from '../src/config/validacion';

const archivo = process.argv[2];
const variables: Record<string, string | undefined> = { ...process.env };
if (archivo) {
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) variables[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}
const r = validarConfiguracion(variables);
console.log(`entorno: ${r.entorno}`);
for (const e of r.errores) console.log(`ERROR  ${e}`);
for (const a of r.avisos) console.log(`aviso  ${a}`);
console.log(r.errores.length ? `${r.errores.length} error(es): la configuración no es válida para ${r.entorno}.` : 'configuración válida');
process.exit(r.errores.length ? 1 : 0);
