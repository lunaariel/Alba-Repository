// Capturas de páginas a 1440 y 390 px para comparar con la propuesta B.
// Uso: BASE=http://localhost:3000 node scripts/capturas.mjs [rutas...]
// Con CORREO y CLAVE ingresa antes de recorrer las rutas (campus).
// Con DESCARGAR=/ruta guarda esa respuesta (por ejemplo, el PDF del certificado) en SALIDA.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const { CORREO, CLAVE, DESCARGAR } = process.env;
const rutas = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const anchos = [1440, 390];

const nombreDe = (ruta) =>
  (ruta === '/' ? 'inicio' : ruta.replace(/^\//, '').replace(/\//g, '_'))
    // Los identificadores largos no aportan al nombre del archivo.
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'id');

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
for (const ancho of anchos) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 1 });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

  if (CORREO && CLAVE) {
    await pagina.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
    await pagina.fill('#correo', CORREO);
    await pagina.fill('#contrasena', CLAVE);
    await Promise.all([pagina.waitForURL(/\/campus/, { timeout: 20000 }), pagina.click('button[type=submit]')]);
    console.log(`ingreso ${ancho}px como ${CORREO}`);
  }

  for (const ruta of rutas) {
    const r = await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    await pagina.screenshot({ path: `${SALIDA}/${nombreDe(ruta)}-${ancho}.png`, fullPage: true });
    // Desborde horizontal: el diseño debe caber en el ancho sin scroll lateral.
    const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const estado = r?.status() ?? 0;
    const final = new URL(pagina.url()).pathname;
    const desvio = final !== ruta ? `  → ${final}` : '';
    console.log(`${estado} ${ancho}px ${ruta}${desvio}${desborde > 0 ? `  DESBORDE ${desborde}px` : ''}`);
    if (estado >= 400 || desborde > 0 || (CORREO && final.startsWith('/ingresar'))) fallas++;
  }

  if (DESCARGAR && ancho === anchos[0]) {
    const r = await pagina.request.get(`${BASE}${DESCARGAR}`);
    const tipo = r.headers()['content-type'] ?? '';
    await writeFile(`${SALIDA}/${nombreDe(DESCARGAR)}.pdf`, await r.body());
    console.log(`${r.status()} descarga ${DESCARGAR} (${tipo})`);
    if (r.status() !== 200 || !tipo.includes('application/pdf')) fallas++;
  }

  for (const e of errores) console.log(`  error en consola (${ancho}px): ${e}`);
  fallas += errores.length;
  await contexto.close();
}
await navegador.close();
process.exit(fallas ? 1 : 0);
