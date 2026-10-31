// Recorrido del bloque E en CI: datos opcionales del perfil (área laboral y estudios) y presentación de la
// maestra editable, que se publica solo después de marcarla como revisada y aprobada.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE, API_URL, ANON_KEY, CORREO2, CLAVE2 } = process.env;
const sql = (q) => execFileSync('psql', [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8' }).trim();

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
const comprobar = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) fallas++; };
const errores = [];
async function sesion(correo, clave, viewport = { width: 1440, height: 900 }) {
  const contexto = await navegador.newContext({ viewport });
  const p = await contexto.newPage();
  p.on('pageerror', (e) => errores.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  if (correo) {
    await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
    await p.fill('#correo', correo);
    await p.fill('#contrasena', clave);
    await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  }
  return { contexto, p };
}
const sinDesborde = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const { p: al } = await sesion(CORREO, CLAVE);
const { p: a } = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const pub = await (await navegador.newContext()).newPage();
try {
  // 1. Perfil: campos opcionales, guardados y protegidos.
  await al.goto(`${BASE}/campus/cuenta`, { waitUntil: 'networkidle' });
  comprobar(await al.getByText('Sobre usted (opcional)').isVisible(), 'la cuenta ofrece área laboral y estudios como opcionales');
  await al.fill('#areaLaboral', 'x');
  await al.getByRole('button', { name: 'Guardar cambios' }).first().click();
  comprobar(await al.getByText(/El área laboral va de 2 a 120 caracteres/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'un valor inválido se explica');
  await al.fill('#areaLaboral', 'Docente de nivel inicial');
  await al.fill('#estudios', 'Profesorado en educación inicial');
  await al.getByRole('button', { name: 'Guardar cambios' }).first().click();
  await al.getByText('Cambios guardados.').first().waitFor({ timeout: 15000 });
  const alumna = sql(`select id from auth.users where email = '${CORREO}'`);
  comprobar(sql(`select area_laboral || ' / ' || estudios from public.perfiles where id = '${alumna}'`) === 'Docente de nivel inicial / Profesorado en educación inicial',
    'se guardan el área laboral y los estudios');
  await al.screenshot({ path: `${SALIDA}/recorrido-perfil-1-cuenta.png`, fullPage: true });
  if (API_URL && ANON_KEY) {
    const token = (await (await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: CORREO2, password: CLAVE2 }),
    })).json()).access_token;
    const r = await fetch(`${API_URL}/rest/v1/perfiles?select=area_laboral,estudios&id=eq.${alumna}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    const filas = r.ok ? await r.json() : [];
    const anon = await fetch(`${API_URL}/rest/v1/perfiles?select=area_laboral`, { headers: { apikey: ANON_KEY } });
    const filasAnon = anon.ok ? await anon.json() : [];
    comprobar(Array.isArray(filas) && filas.length === 0 && Array.isArray(filasAnon) && filasAnon.length === 0,
      'otra alumna y un visitante no leen esos datos por la API');
  } else comprobar(false, 'faltan API_URL y ANON_KEY');

  // 2. Presentación de la maestra: borrador sin publicar; aprobada, se publica.
  await pub.goto(`${BASE}/la-maestra`, { waitUntil: 'networkidle' });
  comprobar((await pub.getByText('Formación y trayectoria').count()) === 0 && (await pub.getByText('Una educadora que vela por las infancias').count()) === 0,
    'sin aprobación, el sitio no muestra la presentación nueva');
  await a.goto(`${BASE}/admin/contenido`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText('Pendiente de revisión').isVisible() && await a.getByText('Diplomado de Guía Montessori').first().isVisible(),
    'el panel muestra la presentación con la trayectoria informada, pendiente de revisión');
  await a.fill('#maestraNombre', 'Maestra de ejemplo');
  await a.getByRole('button', { name: 'Guardar' }).click();
  comprobar(await a.getByText(/Guardado como borrador/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'se guarda como borrador');
  await pub.reload({ waitUntil: 'networkidle' });
  comprobar((await pub.getByText('Formación y trayectoria').count()) === 0, 'el borrador sigue sin publicarse');
  await a.getByLabel(/Revisé y apruebo estos textos/).check();
  await a.getByRole('button', { name: 'Guardar' }).click();
  comprobar(await a.getByText(/Guardado y publicado/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'al aprobar, se publica');
  await a.screenshot({ path: `${SALIDA}/recorrido-perfil-2-presentacion.png`, fullPage: true });
  await pub.reload({ waitUntil: 'networkidle' });
  comprobar(await pub.getByText('Una educadora que vela por las infancias').isVisible() && await pub.getByText('Formación y trayectoria').isVisible()
    && await pub.getByText('Acompañamiento en educación popular').isVisible(), 'la página «La maestra» muestra la presentación aprobada');
  await pub.screenshot({ path: `${SALIDA}/recorrido-perfil-3-la-maestra.png`, fullPage: true });
  comprobar(sql(`select count(*) from public.auditoria where entidad = 'configuracion_academia'`) !== '0', 'los cambios quedan en el registro de actividad');
  // Se deja como estaba (sin aprobar) para no afectar otras capturas.
  await a.getByLabel(/Revisé y apruebo estos textos/).uncheck();
  await a.getByRole('button', { name: 'Guardar' }).click();
  await a.getByText(/Guardado como borrador/).first().waitFor({ timeout: 15000 });

  // 3. Celular.
  const { p: m } = await sesion(ADMIN_CORREO, ADMIN_CLAVE, { width: 390, height: 844 });
  await m.goto(`${BASE}/admin/contenido`, { waitUntil: 'networkidle' });
  comprobar(await sinDesborde(m), 'celular, contenido: sin desborde horizontal');
  await m.screenshot({ path: `${SALIDA}/movil-perfil-contenido.png`, fullPage: true });
  const { p: ma } = await sesion(CORREO, CLAVE, { width: 390, height: 844 });
  await ma.goto(`${BASE}/campus/cuenta`, { waitUntil: 'networkidle' });
  comprobar(await sinDesborde(ma), 'celular, cuenta: sin desborde horizontal');
  await ma.screenshot({ path: `${SALIDA}/movil-perfil-cuenta.png`, fullPage: true });
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${a?.url()})`);
  await a?.screenshot({ path: `${SALIDA}/recorrido-perfil-error.png`, fullPage: true }).catch(() => {});
  await al?.screenshot({ path: `${SALIDA}/recorrido-perfil-error-alumna.png`, fullPage: true }).catch(() => {});
}
for (const e of errores) console.log(`  error en consola: ${e}`);
comprobar(errores.length === 0, 'sin errores en la consola');
await navegador.close();
process.exit(fallas ? 1 : 0);
