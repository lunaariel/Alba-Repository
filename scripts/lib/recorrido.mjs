// Ayudantes compartidos de los recorridos E2E (D15). Los recorridos anteriores conservan los suyos y se
// migran a este módulo cuando se modifiquen; los nuevos lo usan desde el principio.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

export const BASE = process.env.BASE ?? 'http://localhost:3000';
export const SALIDA = process.env.SALIDA ?? 'capturas';
export const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Consulta SQL a la base local (solo local: se niega con cualquier otra URL). */
export function sql(q) {
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB)) throw new Error('Los recorridos solo usan la base local');
  return execFileSync('psql', [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8' }).trim();
}
/** Ejecuta un archivo SQL con variables psql (-v nombre=valor). */
export function sqlArchivo(archivo, variables = {}) {
  const args = [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA'];
  for (const [k, v] of Object.entries(variables)) args.push('-v', `${k}=${v}`);
  return execFileSync('psql', [...args, '-f', archivo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function crearInforme() {
  const estado = { fallas: 0, errores: [] };
  return {
    estado,
    comprobar(ok, texto) { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) estado.fallas++; },
    /** Registra errores de consola y de página con la ruta donde ocurren. */
    vigilar(p) {
      p.on('pageerror', (e) => estado.errores.push(`${String(e)} (en ${new URL(p.url()).pathname})`));
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) estado.errores.push(`${m.text()} (en ${new URL(p.url()).pathname})`); });
    },
  };
}

export const navegadorNuevo = () => chromium.launch();
export const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cuenta de Supabase Auth por la API (para probar la base directamente, sin la aplicación). */
export async function tokenPorClave(apiUrl, anonKey, correo, clave) {
  const r = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: correo, password: clave }),
  });
  return (await r.json()).access_token;
}
