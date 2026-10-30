// Capturas de páginas a 1440 y 390 px para comparar con la propuesta B.
// Uso: BASE=http://localhost:3000 node scripts/capturas.mjs [rutas...]
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const rutas = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const anchos = [1440, 390];

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
for (const ancho of anchos) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 1 });
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  for (const ruta of rutas) {
    const r = await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    const nombre = `${ruta === '/' ? 'inicio' : ruta.replace(/^\//, '').replace(/\//g, '_')}-${ancho}.png`;
    await pagina.screenshot({ path: `${SALIDA}/${nombre}`, fullPage: true });
    // Desborde horizontal: el diseño debe caber en el ancho sin scroll lateral.
    const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const estado = r?.status() ?? 0;
    console.log(`${estado} ${ancho}px ${ruta}${desborde > 0 ? `  DESBORDE ${desborde}px` : ''}`);
    if (estado >= 400 || desborde > 0) fallas++;
  }
  for (const e of errores) console.log(`  error en consola (${ancho}px): ${e}`);
  fallas += errores.length;
}
await navegador.close();
process.exit(fallas ? 1 : 0);
