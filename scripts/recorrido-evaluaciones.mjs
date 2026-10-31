// Recorrido de la modalidad de evaluación (Jornada autónoma, bloque A) en CI, con datos reales del entorno:
// la admin configura un curso con evaluación formativa (sin criterios no se publica), la segunda alumna
// hace las actividades, la admin valida su finalización desde «Alumnos» y la alumna obtiene el certificado.
// Permisos: la solicitud real de validación, reenviada por la alumna o sin sesión, no cambia nada.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO2, CLAVE2, ADMIN_CORREO, ADMIN_CLAVE, API_URL, ANON_KEY } = process.env;
const sql = (q) => execFileSync('psql', [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8' }).trim();

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
const comprobar = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) fallas++; };
const errores = [];

async function sesion(correo, clave, viewport = { width: 1440, height: 900 }) {
  const contexto = await navegador.newContext({ viewport });
  const p = await contexto.newPage();
  p.on('pageerror', (e) => { if (!/Failed to fetch/.test(String(e))) errores.push(String(e)); });
  // «Failed to fetch»: la solicitud que la prueba intercepta y cancela a propósito (capturar).
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(m.text())) errores.push(m.text()); });
  if (correo) {
    await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
    await p.fill('#correo', correo);
    await p.fill('#contrasena', clave);
    await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  }
  return { contexto, p };
}
async function confirmar(p, boton, { palabra, campos = {}, textoConfirmar } = {}) {
  const texto = (await boton.first().textContent()).trim();
  await boton.first().click();
  const dialogo = p.locator('dialog[open]');
  for (const [nombre, valor] of Object.entries(campos)) await dialogo.locator(`[name=${nombre}]`).fill(valor);
  if (palabra) await dialogo.locator('input[name=confirmacion]').fill(palabra);
  await dialogo.getByRole('button', { name: textoConfirmar ?? texto, exact: true }).click();
}
const ve = async (p, re) => {
  const ok = await p.locator('[role=status], [role=alert]').filter({ hasText: re }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!ok) {
    console.log(`      (en ${p.url()} se ve: ${JSON.stringify(await p.locator('[role=status], [role=alert]').allTextContents())})`);
    await p.screenshot({ path: `${SALIDA}/recorrido-evaluaciones-sin-aviso-${Date.now()}.png`, fullPage: true });
  }
  return ok;
};
const sinDesborde = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
/** Intercepta la llamada a la acción del servidor y la cancela (no llega al servidor). */
async function capturar(p, paso) {
  let capturada = null;
  const manejador = async (route, req) => {
    if (req.method() === 'POST' && req.headers()['next-action']) {
      capturada = { ruta: new URL(req.url()).pathname, accion: req.headers()['next-action'], tipo: req.headers()['content-type'],
        arbol: req.headers()['next-router-state-tree'], cuerpo: req.postDataBuffer() };
      return route.abort();
    }
    return route.continue();
  };
  await p.route('**/*', manejador);
  try { await paso(); for (let i = 0; i < 100 && !capturada; i++) await p.waitForTimeout(100); } finally { await p.unroute('**/*', manejador); }
  return capturada;
}
const reenviar = async (contexto, c) => (await contexto.request.fetch(`${BASE}${c.ruta}`, {
  method: 'POST', maxRedirects: 0, data: c.cuerpo,
  headers: { 'Next-Action': c.accion, 'Content-Type': c.tipo, Accept: 'text/x-component', Origin: BASE, ...(c.arbol ? { 'Next-Router-State-Tree': c.arbol } : {}) },
})).status();

// Curso en borrador con dos lecciones y una pregunta (con respuesta correcta y tema).
const CURSO = sql(`
  insert into public.cursos (slug, titulo, precio_centavos, resumen) values ('formativo-recorrido', '[Ejemplo] Curso formativo', 3000, 'Curso para probar la evaluación formativa.') returning id;`).split('\n').pop();
sql(`do $$ declare m uuid; e uuid; q uuid; begin
  insert into public.modulos (curso_id, titulo, orden) values ('${CURSO}', 'Módulo único', 0) returning id into m;
  insert into public.lecciones (modulo_id, titulo, orden) values (m, 'Primera lección', 0), (m, 'Segunda lección', 1);
  insert into public.evaluaciones (curso_id) values ('${CURSO}') returning id into e;
  insert into public.preguntas (evaluacion_id, enunciado, tipo, orden, tema) values (e, '¿Qué conviene hacer antes de intervenir?', 'unica', 0, 'Observación') returning id into q;
  insert into public.opciones (pregunta_id, texto, es_correcta, orden) values (q, 'Observar', true, 0), (q, 'Corregir enseguida', false, 1);
end $$;`);
comprobar(sql(`select intentos_permitidos || '/' || puntaje_minimo from public.evaluaciones where curso_id = '${CURSO}'`) === '2/70',
  'una evaluación nueva usa los valores predeterminados: 70 % y 2 intentos');

const { contexto: ctxAdmin, p: a } = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const { contexto: ctxAlumna, p: al } = await sesion(CORREO2, CLAVE2);
const anonimo = await navegador.newContext();
const base = `/admin/cursos/${CURSO}`;
try {
  // 1. Formativa con certificado y sin criterios: aviso y el curso no se puede publicar.
  await a.goto(`${BASE}${base}/evaluacion`, { waitUntil: 'networkidle' });
  await a.getByLabel(/Evaluación formativa/).check();
  comprobar(await a.getByText(/elija al menos un criterio además de las lecciones/).isVisible(), 'sin criterios, el formulario explica que no alcanza para certificar');
  comprobar(await a.getByText(/Este curso no entrega certificado|Al cumplir todo/).first().isVisible(), 'la vista previa del alumno se actualiza');
  await a.getByRole('button', { name: 'Guardar criterios' }).click();
  comprobar(await ve(a, /Configuración guardada/), 'se guarda la modalidad formativa');
  await a.goto(`${BASE}${base}/publicacion`, { waitUntil: 'networkidle' });
  comprobar((await a.getByRole('button', { name: 'Publicar el curso' }).count()) === 0 && await a.getByText(/Un criterio para certificar/).isVisible(),
    'sin criterios de certificación el curso queda en borrador');

  // 2. Actividades + validación docente; vista previa; publicar.
  await a.goto(`${BASE}${base}/evaluacion`, { waitUntil: 'networkidle' });
  await a.getByLabel(/Responder las actividades formativas/).check();
  await a.getByLabel(/Mi validación como docente/).check();
  const previa = await a.locator('section', { hasText: 'Vista previa' }).last().innerText();
  comprobar(/No llevan nota/.test(previa) && /validación de la maestra/.test(previa) && !/puntos/.test(previa), 'la vista previa muestra lo que verá el alumno, sin puntaje');
  await a.screenshot({ path: `${SALIDA}/recorrido-evaluaciones-1-configuracion.png`, fullPage: true });
  await a.getByRole('button', { name: 'Guardar criterios' }).click();
  comprobar(await ve(a, /Configuración guardada/), 'se guardan los requisitos de finalización');
  await a.goto(`${BASE}${base}/publicacion`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Publicar el curso' }));
  comprobar(await ve(a, /publicado/i), 'el curso formativo se publica');
  comprobar(sql(`select modalidad || ':' || requiere_actividades || ':' || requiere_validacion from public.versiones_curso where curso_id = '${CURSO}'`) === 'formativa:true:true',
    'la versión 1 fija la modalidad y los requisitos');

  // 3. La segunda alumna recibe acceso y ve sus requisitos.
  const alumna = sql(`select id from auth.users where email = '${CORREO2}'`);
  sql(`insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values ('${alumna}', '${CURSO}', 'concesion', 'Recorrido de evaluación formativa')`);
  await al.goto(`${BASE}/campus/cursos/formativo-recorrido`, { waitUntil: 'networkidle' });
  comprobar(await al.getByRole('heading', { name: 'Para terminar el curso' }).isVisible() && await al.getByText(/No llevan nota/).isVisible()
    && (await al.getByRole('heading', { name: 'Evaluación final' }).count()) === 0, 'el campus muestra los requisitos formativos, sin evaluación final');
  comprobar(await al.getByText(/Falta completar 2 lecciones, responder todas las actividades formativas y recibir la validación de la maestra/).isVisible(),
    'el certificado explica todo lo que falta');
  const sumativa = await ctxAlumna.request.get(`${BASE}/campus/cursos/formativo-recorrido/evaluacion`);
  comprobar(sumativa.status() === 404, `la evaluación final no existe en la modalidad formativa (${sumativa.status()})`);

  // 4. Actividades: sin responder no se completan; respondidas, sí (sin nota).
  await al.goto(`${BASE}/campus/cursos/formativo-recorrido/actividades`, { waitUntil: 'networkidle' });
  await al.getByRole('button', { name: 'Enviar mis respuestas' }).click();
  comprobar(await al.getByText('Faltan respuestas').waitFor({ timeout: 15000 }).then(() => true, () => false), 'un envío incompleto no completa las actividades');
  await al.getByRole('button', { name: 'Hacerlas de nuevo' }).click();
  await al.getByLabel('Corregir enseguida').check();
  await al.getByRole('button', { name: 'Enviar mis respuestas' }).click();
  comprobar(await al.getByText('Actividades completadas').waitFor({ timeout: 15000 }).then(() => true, () => false)
    && await al.getByText('Observación').isVisible() && !(await al.content()).includes('puntos'), 'actividades completas, con temas a repasar y sin nota');
  await al.screenshot({ path: `${SALIDA}/recorrido-evaluaciones-2-actividades.png`, fullPage: true });
  sql(`insert into public.progreso_leccion (perfil_id, leccion_id, completada_en)
       select '${alumna}', l.id, now() from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = '${CURSO}'`);
  await al.goto(`${BASE}/campus/cursos/formativo-recorrido`, { waitUntil: 'networkidle' });
  comprobar(await al.getByText(/La maestra revisa su recorrido/).isVisible() && (await al.getByRole('button', { name: 'Obtener mi certificado' }).count()) === 0,
    'sin la validación docente no se ofrece el certificado');

  // 5. Permisos: la solicitud real de validación, reenviada por la alumna o sin sesión, no valida nada.
  await a.goto(`${BASE}${base}/alumnos`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText('Versión 1 (vigente)').isVisible() && await a.getByText(/Recibir la validación de la maestra/).isVisible(), 'la admin ve a la alumna por versión y lo que le falta');
  const validar = await capturar(a, () => confirmar(a, a.getByRole('button', { name: 'Validar finalización' }), { campos: { nota: 'Acompañé su recorrido y cumplió lo esperado.' } }));
  comprobar(Boolean(validar), 'se capturó la solicitud real de validación');
  if (validar) {
    for (const [quien, ctx] of [['alumna', ctxAlumna], ['visitante', anonimo]]) {
      const estado = await reenviar(ctx, validar);
      comprobar(estado === 404 && sql(`select count(*) from public.validaciones_formativas where curso_id = '${CURSO}'`) === '0',
        `${quien}: validar la finalización se rechaza (${estado}), sin cambios`);
    }
  }
  if (API_URL && ANON_KEY) {
    const token = (await (await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: CORREO2, password: CLAVE2 }),
    })).json()).access_token;
    const api = (ruta, cuerpo) => fetch(`${API_URL}${ruta}`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const r1 = await api('/rest/v1/rpc/validar_finalizacion', { p_perfil: alumna, p_curso: CURSO, p_nota: 'Me valido a mí misma por la API.' });
    const r2 = await api('/rest/v1/rpc/registrar_actividad_formativa', { p_perfil: alumna, p_evaluacion: sql(`select id from public.evaluaciones where curso_id = '${CURSO}'`), p_respuestas: {} });
    const r3 = await api('/rest/v1/rpc/estado_finalizacion_de', { p_perfil: alumna, p_curso: CURSO });
    const r4 = await fetch(`${API_URL}/rest/v1/respuestas_intento?select=correcta`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    comprobar(r1.status >= 400 && r2.status >= 400 && r3.status >= 400 && r4.status >= 400
      && sql(`select count(*) from public.validaciones_formativas where curso_id = '${CURSO}'`) === '0',
      `API con el token de la alumna: validar ${r1.status}, registrar por el servidor ${r2.status}, estado ajeno ${r3.status}, «correcta» ${r4.status}`);
  } else comprobar(false, 'faltan API_URL y ANON_KEY');

  // 6. La admin valida con nota; la alumna obtiene el certificado.
  await a.goto(`${BASE}${base}/alumnos`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Validar finalización' }), { campos: { nota: 'Acompañé su recorrido y cumplió lo esperado.' } });
  comprobar(await ve(a, /Finalización validada/) && await a.getByText('Validada por usted').isVisible(), 'la admin valida la finalización con su nota');
  await a.screenshot({ path: `${SALIDA}/recorrido-evaluaciones-3-alumnos.png`, fullPage: true });
  await al.goto(`${BASE}/campus/cursos/formativo-recorrido`, { waitUntil: 'networkidle' });
  comprobar(await al.getByText('Cumplió todos los requisitos.').isVisible(), 'la alumna ve que cumplió todo');
  await Promise.all([al.waitForURL(/certificado-listo/), al.getByRole('button', { name: 'Obtener mi certificado' }).click()]);
  comprobar(await al.getByText('Su certificado está listo.').isVisible()
    && sql(`select modalidad from public.certificados where curso_id = '${CURSO}'`) === 'formativa', 'certificado formativo emitido');
  await al.screenshot({ path: `${SALIDA}/recorrido-evaluaciones-4-campus.png`, fullPage: true });
  await a.goto(`${BASE}${base}/alumnos`, { waitUntil: 'networkidle' });
  comprobar((await a.getByRole('button', { name: 'Anular' }).count()) === 0 && await a.getByText('Certificado emitido').isVisible(),
    'con certificado emitido ya no se ofrece anular la validación');

  // 7. Un cambio de modalidad muestra sus consecuencias y rige desde la próxima versión.
  await a.goto(`${BASE}${base}/evaluacion`, { waitUntil: 'networkidle' });
  await a.getByLabel(/Evaluación final con puntaje/).check();
  comprobar(await a.getByText(/Pasa a evaluación final con puntaje/).isVisible() && await a.getByText(/Rige desde la próxima versión/).isVisible(),
    'cambiar la modalidad muestra las consecuencias antes de guardar');

  // 8. Celular: sin desbordes.
  const { p: m } = await sesion(ADMIN_CORREO, ADMIN_CLAVE, { width: 390, height: 844 });
  for (const [ruta, nombre] of [[`${base}/evaluacion`, 'evaluacion'], [`${base}/alumnos`, 'alumnos'], [`${base}/publicacion`, 'publicacion']]) {
    await m.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    comprobar(await sinDesborde(m), `celular, panel ${nombre}: sin desborde horizontal`);
    await m.screenshot({ path: `${SALIDA}/movil-evaluaciones-${nombre}.png`, fullPage: true });
  }
  const { p: mal } = await sesion(CORREO2, CLAVE2, { width: 390, height: 844 });
  for (const [ruta, nombre] of [['/campus/cursos/formativo-recorrido', 'campus-curso'], ['/campus/cursos/formativo-recorrido/actividades', 'campus-actividades']]) {
    await mal.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    comprobar(await sinDesborde(mal), `celular, ${nombre}: sin desborde horizontal`);
    await mal.screenshot({ path: `${SALIDA}/movil-evaluaciones-${nombre}.png`, fullPage: true });
  }
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${a?.url()})`);
  await a?.screenshot({ path: `${SALIDA}/recorrido-evaluaciones-error.png`, fullPage: true }).catch(() => {});
  await al?.screenshot({ path: `${SALIDA}/recorrido-evaluaciones-error-alumna.png`, fullPage: true }).catch(() => {});
}
for (const e of errores) console.log(`  error en consola: ${e}`);
comprobar(errores.length === 0, 'sin errores en la consola');
await navegador.close();
process.exit(fallas ? 1 : 0);
