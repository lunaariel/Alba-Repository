// D14: carga repetida de las páginas principales (sitio, campus y panel) en escritorio y celular, con carga
// completa y con navegación interna, buscando errores de hidratación de React (#418, #423, #425 o el texto
// «Hydration failed»). Registra la ruta, el ancho y la vuelta de cada error. No oculta advertencias: cualquier
// error de consola cuenta como falla.
// Uso: VUELTAS=5 node scripts/recorrido-hidratacion.mjs  (con las variables de campus.env)
import { BASE, crearInforme, navegadorNuevo } from './lib/recorrido.mjs';

const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE } = process.env;
const VUELTAS = Number(process.env.VUELTAS ?? 3);
const RUTAS = {
  publico: ['/', '/cursos', '/cursos/demo-montessori-en-casa', '/la-maestra', '/contacto', '/ingresar', '/registro', '/verificar', '/legales/privacidad'],
  campus: ['/campus', '/campus/cursos/demo-montessori-en-casa', '/campus/talleres', '/campus/compras', '/campus/cuenta'],
  // El campus de la admin: antes mezclaba accesos y compras de todas las alumnas (claves duplicadas).
  campusAdmin: ['/campus', '/campus/compras', '/campus/talleres'],
  admin: ['/admin', '/admin/cursos', '/admin/cursos/c1000000-0000-0000-0000-000000000001', '/admin/cursos/c1000000-0000-0000-0000-000000000001/publicacion',
    '/admin/cursos/c1000000-0000-0000-0000-000000000001/alumnos', '/admin/cursos/c1000000-0000-0000-0000-000000000002/evaluacion',
    '/admin/talleres', '/admin/configuracion', '/admin/configuracion/actividad'],
};
const ES_HIDRATACION = /Minified React error #(418|423|425)|Hydration failed|hydrat/i;
const { comprobar } = crearInforme();
const navegador = await navegadorNuevo();
const hallazgos = [];

async function contexto(ancho, correo, clave) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
  const p = await ctx.newPage();
  if (correo) {
    await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
    await p.fill('#correo', correo);
    await p.fill('#contrasena', clave);
    await Promise.all([p.waitForURL((u) => u.pathname !== '/ingresar', { timeout: 20000 }), p.click('button[type=submit]')]);
  }
  return { ctx, p };
}

try {
  for (const ancho of [1440, 390]) {
    for (const [grupo, rutas] of Object.entries(RUTAS)) {
      const cuenta = grupo === 'campus' ? [CORREO, CLAVE] : grupo.startsWith('admin') || grupo === 'campusAdmin' ? [ADMIN_CORREO, ADMIN_CLAVE] : [];
      const { ctx, p } = await contexto(ancho, ...cuenta);
      let vuelta = 0;
      const errores = [];
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push({ texto: m.text(), ruta: new URL(p.url()).pathname, vuelta }); });
      p.on('pageerror', (e) => errores.push({ texto: String(e), ruta: new URL(p.url()).pathname, vuelta }));
      for (vuelta = 1; vuelta <= VUELTAS; vuelta++) {
        for (const ruta of rutas) {
          // Carga completa (hidratación desde el HTML del servidor)…
          await p.goto(`${BASE}${ruta}`, { waitUntil: vuelta % 2 ? 'networkidle' : 'domcontentloaded' });
          if (vuelta % 2 === 0) await p.waitForLoadState('networkidle');
        }
        // …y una navegación que corta otra a medio cargar (hidratación interrumpida).
        await p.goto(`${BASE}${rutas[0]}`, { waitUntil: 'commit' }).catch(() => {});
        await p.goto(`${BASE}${rutas[rutas.length - 1]}`, { waitUntil: 'networkidle' });
      }
      for (const e of errores) hallazgos.push({ ...e, ancho, grupo });
      comprobar(errores.length === 0, `hidratación ${grupo} ${ancho}px: ${rutas.length} rutas × ${VUELTAS} vueltas sin errores de consola`);
      await ctx.close();
    }
  }
} finally {
  await navegador.close();
}
for (const h of hallazgos) console.log(`  ${ES_HIDRATACION.test(h.texto) ? 'HIDRATACIÓN' : 'error'} ${h.grupo} ${h.ancho}px vuelta ${h.vuelta} en ${h.ruta}: ${h.texto.slice(0, 200)}`);
process.exit(hallazgos.length ? 1 : 0);
