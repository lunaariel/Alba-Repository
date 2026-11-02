// Recorrido de vencimientos de cursos (Jornada autónoma, bloque B) en CI: la admin define la duración
// comercial, el sitio muestra las condiciones antes de comprar, la compra simulada copia las condiciones,
// el campus muestra la fecha de vencimiento y, al vencer, protege el contenido y conserva el certificado.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO, CLAVE, CORREO2, CLAVE2, ADMIN_CORREO, ADMIN_CLAVE } = process.env;
const sql = (q) => execFileSync('psql', [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8' }).trim();

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
const comprobar = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) fallas++; };
const errores = [];
async function sesion(correo, clave, viewport = { width: 1440, height: 900 }) {
  const contexto = await navegador.newContext({ viewport });
  const p = await contexto.newPage();
  p.on('pageerror', (e) => errores.push(`${String(e)} (en ${new URL(p.url()).pathname})`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`${m.text()} (en ${new URL(p.url()).pathname})`); });
  if (correo) {
    await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
    await p.fill('#correo', correo);
    await p.fill('#contrasena', clave);
    await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  }
  return { contexto, p };
}
const sinDesborde = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const C1 = 'c1000000-0000-0000-0000-000000000001';

const { p: a } = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const { contexto: ctxAlumna2, p: al2 } = await sesion(CORREO2, CLAVE2);
const { p: al1 } = await sesion(CORREO, CLAVE);
try {
  // 1. La admin ve y cambia la duración comercial; el cambio solo vale para compras futuras.
  await a.goto(`${BASE}/admin/cursos/${C1}`, { waitUntil: 'networkidle' });
  comprobar((await a.inputValue('#duracionComercial')) === '3' && await a.getByText(/en total/).first().isVisible(), 'la admin ve la duración comercial y el total con los 5 meses');
  await a.fill('#duracionComercial', '4');
  comprobar(await a.getByText(/en total 9 meses/).isVisible(), 'el total se recalcula en vivo (4 + 5 = 9)');
  await a.fill('#duracionComercial', '99');
  await a.getByRole('button', { name: 'Guardar cambios' }).click();
  comprobar(await a.getByText(/va de 1 a 60 meses/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'una duración fuera de rango se explica');
  await a.fill('#duracionComercial', '4');
  await a.getByRole('button', { name: 'Guardar cambios' }).click();
  await a.getByText('Cambios guardados.').waitFor({ timeout: 15000 });
  comprobar(sql(`select duracion_comercial_meses from public.cursos where id = '${C1}'`) === '4', 'se guarda la duración comercial');
  await a.screenshot({ path: `${SALIDA}/recorrido-vencimientos-1-datos.png`, fullPage: true });

  // 2. La compra anterior (3 meses) conserva sus condiciones; el sitio muestra las nuevas antes de comprar.
  const alumna1 = sql(`select id from auth.users where email = '${CORREO}'`);
  comprobar(sql(`select condiciones ->> 'total_meses' from public.accesos_curso where perfil_id = '${alumna1}' and curso_id = '${C1}'`) === '8',
    'la compra anterior conserva 3 + 5 = 8 meses');
  const pub = await (await navegador.newContext()).newPage();
  await pub.goto(`${BASE}/cursos/demo-montessori-en-casa`, { waitUntil: 'networkidle' });
  comprobar(await pub.getByText('Acceso por 9 meses desde la compra (4 meses del curso + 5 meses adicionales)').isVisible()
    && (await pub.getByText('Acceso sin vencimiento').count()) === 0, 'la ficha pública muestra las condiciones de acceso antes de comprar');
  await pub.screenshot({ path: `${SALIDA}/recorrido-vencimientos-2-ficha.png`, fullPage: true });

  // 3. El campus muestra la fecha de vencimiento calculada por el servidor.
  await al1.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  const tarjeta = al1.locator('li', { hasText: 'Montessori en casa' });
  comprobar(await tarjeta.getByText(/Acceso hasta el/).isVisible(), 'la tarjeta del curso comprado muestra hasta cuándo hay acceso');
  comprobar((await al1.locator('li', { hasText: 'Desarrollo y autonomía' }).getByText(/Acceso hasta/).count()) === 0,
    'un acceso concedido (sin vencimiento) no muestra fecha');

  // 4. Compra simulada de la segunda alumna, vencimiento (ajuste solo de prueba) y protección del contenido.
  const alumna2 = sql(`select id from auth.users where email = '${CORREO2}'`);
  const orden = sql(`select public.crear_orden('${alumna2}', 'curso', '${C1}')`);
  sql(`select public.procesar_evento_pago('simulado', 'venc-evt', 'pago', '{}', '${orden}', 'venc-pago', 'aprobado', 4900)`);
  comprobar(sql(`select (vence_en = public.calcular_vencimiento(inicia_en, 9))::text from public.accesos_curso where perfil_id = '${alumna2}' and curso_id = '${C1}'`) === 'true',
    'la compra nueva vence a los 9 meses del pago confirmado');
  const material = sql(`select r.id from public.recursos_leccion r join public.lecciones l on l.id = r.leccion_id join public.modulos m on m.id = l.modulo_id where m.curso_id = '${C1}' and not r.complementario limit 1`);
  const antes = await ctxAlumna2.request.get(`${BASE}/campus/materiales/${material}`, { maxRedirects: 0 });
  // Paso del tiempo (solo en pruebas): se corren 10 meses hacia atrás el acceso y sus períodos (0024), juntos.
  sql(`begin;
       alter table public.periodos_acceso disable trigger periodos_inmutables;
       update public.periodos_acceso set inicia_en = inicia_en - interval '10 months', vence_en = vence_en - interval '10 months' where perfil_id = '${alumna2}' and curso_id = '${C1}';
       alter table public.periodos_acceso enable trigger periodos_inmutables;
       select set_config('albor.ajuste_vencimiento', 'si', true);
       update public.accesos_curso set inicia_en = inicia_en - interval '10 months', vence_en = vence_en - interval '10 months' where perfil_id = '${alumna2}' and curso_id = '${C1}'; commit;`);
  await al2.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  comprobar(await al2.getByRole('heading', { name: 'Cursos con el acceso vencido' }).isVisible() && await al2.getByText(/Acceso vencido el/).isVisible(),
    'el campus muestra el curso vencido aparte');
  await al2.screenshot({ path: `${SALIDA}/recorrido-vencimientos-3-campus-vencido.png`, fullPage: true });
  const curso = await ctxAlumna2.request.get(`${BASE}/campus/cursos/demo-montessori-en-casa`);
  const despues = await ctxAlumna2.request.get(`${BASE}/campus/materiales/${material}`, { maxRedirects: 0 });
  comprobar(curso.status() === 404 && despues.status() === 404 && antes.status() !== 404,
    `vencido: el curso (${curso.status()}) y el material (${despues.status()}, antes ${antes.status()}) dejan de estar disponibles`);
  // Su certificado del curso formativo (otro curso, sin vencimiento) sigue disponible.
  const cert = sql(`select id from public.certificados where perfil_id = '${alumna2}' limit 1`);
  if (cert) {
    const r = await ctxAlumna2.request.get(`${BASE}/campus/certificados/${cert}`);
    comprobar(r.status() === 200, `sus certificados siguen descargables (${r.status()})`);
  }

  // 5. Panel: la admin ve el vencimiento en la lista de alumnos.
  await a.goto(`${BASE}/admin/cursos/${C1}/alumnos`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(/acceso vencido el/).first().isVisible() && await a.getByText(/acceso hasta el/).first().isVisible(),
    'la lista de alumnos muestra vigentes y vencidos');
  await a.screenshot({ path: `${SALIDA}/recorrido-vencimientos-4-alumnos.png`, fullPage: true });

  // 6. Celular.
  const { p: m } = await sesion(CORREO2, CLAVE2, { width: 390, height: 844 });
  await m.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  comprobar(await sinDesborde(m), 'celular, campus con curso vencido: sin desborde horizontal');
  await m.screenshot({ path: `${SALIDA}/movil-vencimientos-campus.png`, fullPage: true });
  await m.goto(`${BASE}/cursos/demo-montessori-en-casa`, { waitUntil: 'networkidle' });
  comprobar(await sinDesborde(m), 'celular, ficha con condiciones: sin desborde horizontal');
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${a?.url()})`);
  await a?.screenshot({ path: `${SALIDA}/recorrido-vencimientos-error.png`, fullPage: true }).catch(() => {});
}
for (const e of errores) console.log(`  error en consola: ${e}`);
comprobar(errores.length === 0, 'sin errores en la consola');
await navegador.close();
process.exit(fallas ? 1 : 0);
