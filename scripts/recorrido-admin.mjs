// Recorrido del panel (Fase 5, entrega 1) en CI: quién entra, quién no, y el registro de actividad.
// Datos de tests/visual/campus.sh (alumna y administradora de ejemplo).
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE } = process.env;
const SECCIONES = ['/admin', '/admin/cursos', '/admin/talleres', '/admin/alumnos', '/admin/certificados',
  '/admin/ventas', '/admin/contenido', '/admin/comunicaciones', '/admin/configuracion', '/admin/configuracion/actividad'];

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
const comprobar = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) fallas++; };

async function ingresar(contexto, correo, clave) {
  const p = await contexto.newPage();
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', correo);
  await p.fill('#contrasena', clave);
  await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  return p;
}

// Texto de la página de "no encontrado" real, para comparar.
const referencia = await navegador.newContext();
const inexistente = await referencia.request.get(`${BASE}/esta-direccion-no-existe`);
const textoNoEncontrado = 'No encontramos esta página';
comprobar(inexistente.status() === 404 && (await inexistente.text()).includes(textoNoEncontrado), 'una dirección inexistente da 404');
await referencia.close();

try {
  // 1. Sin sesión: el panel no existe (404, sin redirigir a ingresar).
  const anonimo = await navegador.newContext();
  for (const ruta of SECCIONES) {
    const r = await anonimo.request.get(`${BASE}${ruta}`, { maxRedirects: 0 });
    const cuerpo = await r.text();
    comprobar(r.status() === 404 && cuerpo.includes(textoNoEncontrado) && !cuerpo.includes('panel'),
      `sin sesión, ${ruta} responde 404 igual que una página inexistente (${r.status()})`);
  }
  const robots = await (await anonimo.request.get(`${BASE}/robots.txt`)).text();
  comprobar(!robots.includes('/admin'), 'robots.txt no menciona el panel');
  await anonimo.close();

  // 2. Alumna con sesión: tampoco entra, ni ve el enlace al panel.
  const alumna = await navegador.newContext();
  const pa = await ingresar(alumna, CORREO, CLAVE);
  comprobar((await pa.getByRole('link', { name: 'Panel' }).count()) === 0, 'la alumna no ve el enlace al panel');
  for (const ruta of SECCIONES) {
    const r = await alumna.request.get(`${BASE}${ruta}`, { maxRedirects: 0 });
    comprobar(r.status() === 404, `alumna en ${ruta}: ${r.status()}`);
  }
  await alumna.close();

  // 3. Administradora: entra desde el campus y recorre todas las secciones.
  const admin = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ingresar(admin, ADMIN_CORREO, ADMIN_CLAVE);
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await Promise.all([p.waitForURL((u) => u.pathname === '/admin'), p.getByRole('link', { name: 'Panel' }).first().click()]);
  comprobar(await p.getByRole('heading', { name: 'Hoy' }).isVisible(), 'la administradora entra al panel desde el campus');
  for (const ruta of SECCIONES) {
    const r = await p.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    const actual = await p.locator('[aria-current=page]').first().textContent();
    comprobar(r?.status() === 200, `admin en ${ruta}: ${r?.status()} (menú marca «${actual?.trim()}»)`);
  }
  const html = await (await p.goto(`${BASE}/admin`)).text();
  comprobar(/<meta name="robots" content="noindex, nofollow"/.test(html), 'el panel pide no ser indexado');

  // 4. Registro de actividad: lo hecho por la maestra, legible, con antes y después.
  await p.goto(`${BASE}/admin/configuracion/actividad`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText('Modificó un taller').first().isVisible(), 'figura el cambio del taller');
  comprobar(await p.getByText('Maestra (ejemplo)').first().isVisible(), 'con el nombre de la autora');
  comprobar(await p.getByText('Asignó el rol de administración').first().isVisible(), 'figura la asignación del rol admin');
  await p.screenshot({ path: `${SALIDA}/admin-actividad-1440.png`, fullPage: true });
  await p.goto(`${BASE}/admin/configuracion/actividad?grupo=talleres`, { waitUntil: 'networkidle' });
  comprobar((await p.getByText('Creó un cupón').count()) === 0 && await p.getByText('Modificó un taller').first().isVisible(), 'el filtro por tema funciona');
  const raro = await p.goto(`${BASE}/admin/configuracion/actividad?grupo=constructor&pagina=-5`);
  comprobar(raro?.status() === 200, 'parámetros inválidos no rompen la página');
  for (const e of errores) console.log(`  error en consola: ${e}`);
  comprobar(errores.length === 0, 'sin errores en la consola');
  await admin.close();
} catch (e) {
  comprobar(false, String(e.message).split('\n').slice(0, 6).join(' | '));
}

await navegador.close();
process.exit(fallas ? 1 : 0);
