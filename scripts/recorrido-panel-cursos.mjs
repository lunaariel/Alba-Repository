// Recorrido de los pendientes del panel de cursos (Jornada autónoma, bloque C) en CI:
// duplicar (con copia real del PDF en el almacenamiento y con un archivo faltante), vista previa del
// borrador sin efectos, cambios de orden entre versiones, descarte de una revisión calculada, bloqueo
// excepcional de un material, y las mismas solicitudes reenviadas por la alumna o sin sesión.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE, PREGUNTA } = process.env;
const sql = (q) => execFileSync('psql', [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8' }).trim();
const C1 = 'c1000000-0000-0000-0000-000000000001';
// C2: su pregunta no tiene revisiones aplicadas (el recorrido del editor aplica una en C3).
const C2 = 'c1000000-0000-0000-0000-000000000002';

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
  const ok = await p.locator('[role=status], [role=alert]').filter({ hasText: re }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (!ok) {
    console.log(`      (en ${p.url()} se ve: ${JSON.stringify(await p.locator('[role=status], [role=alert]').allTextContents())})`);
    await p.screenshot({ path: `${SALIDA}/recorrido-panel-cursos-sin-aviso-${Date.now()}.png`, fullPage: true });
  }
  return ok;
};
const sinDesborde = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
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

const { p: a } = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const { contexto: ctxAlumna } = await sesion(CORREO, CLAVE);
const anonimo = await navegador.newContext();
try {
  // 1. Duplicar el curso creado por el recorrido del editor (tiene un PDF real en el almacenamiento).
  const prueba = sql(`select id from public.cursos where slug = 'curso-de-prueba-del-panel'`);
  const cursosAntes = sql('select count(*) from public.cursos');
  await a.goto(`${BASE}/admin/cursos/${prueba}/publicacion`, { waitUntil: 'networkidle' });
  const duplicar = await capturar(a, () => confirmar(a, a.getByRole('button', { name: 'Duplicar el curso' }), { textoConfirmar: 'Crear la copia' }));
  comprobar(Boolean(duplicar), 'se capturó la solicitud real de duplicar');
  if (duplicar) {
    for (const [quien, ctx] of [['alumna', ctxAlumna], ['visitante', anonimo]]) {
      const estado = await reenviar(ctx, duplicar);
      comprobar(estado === 404 && sql('select count(*) from public.cursos') === cursosAntes, `${quien}: duplicar se rechaza (${estado}), sin cursos nuevos`);
    }
  }
  await a.goto(`${BASE}/admin/cursos/${prueba}/publicacion`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Duplicar el curso' }), { textoConfirmar: 'Crear la copia' });
  comprobar(await ve(a, /Copia creada como borrador independiente/), 'la copia se crea como borrador independiente');
  const copia = new URL(a.url()).pathname.split('/')[3];
  comprobar(sql(`select estado || ':' || (select count(*) from public.accesos_curso where curso_id = '${copia}') || ':' || (select count(*) from public.versiones_curso where curso_id = '${copia}') from public.cursos where id = '${copia}'`) === 'borrador:0:0',
    'la copia no tiene alumnos ni versiones');
  const destino = sql(`select r.ruta_almacenamiento from public.recursos_leccion r join public.lecciones l on l.id = r.leccion_id join public.modulos m on m.id = l.modulo_id where m.curso_id = '${copia}' limit 1`);
  comprobar(destino.startsWith(`cursos/${copia}/`) && sql(`select count(*) from storage.objects where bucket_id = 'materiales' and name = '${destino}'`) === '1',
    'el PDF se copió en el almacenamiento con una ruta propia');
  await a.goto(`${BASE}/admin/cursos/${copia}/alumnos`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText('Todavía nadie tiene acceso a este curso.').isVisible(), 'la copia muestra el estado vacío de alumnos');

  // 1b. Duplicar un curso cuyo PDF falta en el almacenamiento: la copia queda sin ese material y se avisa.
  await a.goto(`${BASE}/admin/cursos/${C1}/publicacion`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Duplicar el curso' }), { textoConfirmar: 'Crear la copia' });
  comprobar(await ve(a, /Algunos PDF no se pudieron copiar/), 'si un PDF no se puede copiar, se avisa');
  const copiaC1 = new URL(a.url()).pathname.split('/')[3];
  comprobar(sql(`select count(*) from public.recursos_leccion r join public.lecciones l on l.id = r.leccion_id join public.modulos m on m.id = l.modulo_id where m.curso_id = '${copiaC1}'`) === '0',
    'el material sin archivo no queda en la copia');

  // 2. Vista previa del borrador: solo lectura.
  const progreso = sql('select count(*) from public.progreso_leccion') + '/' + sql('select count(*) from public.accesos_curso');
  await a.goto(`${BASE}/admin/cursos/${C1}/vista-previa`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(/Vista previa del borrador/).isVisible() && await a.getByRole('heading', { name: 'Para terminar el curso' }).isVisible(), 'la vista previa muestra el borrador como lo vería un alumno');
  await a.getByRole('link', { name: /Rutinas que dan autonomía/ }).click();
  await a.waitForURL(/leccion=/);
  comprobar(await a.getByRole('heading', { name: 'Rutinas que dan autonomía' }).isVisible(), 'se navega entre lecciones en la vista previa');
  comprobar(!(await a.content()).includes('es_correcta') && (sql('select count(*) from public.progreso_leccion') + '/' + sql('select count(*) from public.accesos_curso')) === progreso,
    'la vista previa no crea avances ni accesos y no muestra claves');
  await a.screenshot({ path: `${SALIDA}/recorrido-panel-cursos-1-vista-previa.png`, fullPage: true });

  // 3. Cambios de orden: se intercambian dos lecciones del borrador de C1 y luego se restauran.
  const [l0, l1] = sql(`select l.id from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = '${C1}' and m.orden = 0 order by l.orden`).split('\n');
  const intercambiar = () => sql(`begin; set constraints all deferred;
    update public.lecciones set orden = case id when '${l0}' then (select orden from public.lecciones where id = '${l1}') else (select orden from public.lecciones where id = '${l0}') end where id in ('${l0}', '${l1}'); commit;`);
  intercambiar();
  await a.goto(`${BASE}/admin/cursos/${C1}/publicacion`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(/Cambios de orden/).isVisible() && await a.getByText(/del lugar 2 al 1/).isVisible(), 'la publicación muestra los cambios de orden frente a la versión vigente');
  await a.screenshot({ path: `${SALIDA}/recorrido-panel-cursos-2-orden.png`, fullPage: true });
  intercambiar();

  // 4. Revisión favorable calculada y descartada (con permisos).
  await a.goto(`${BASE}/admin/cursos/${C2}/evaluacion/${PREGUNTA}/revision`, { waitUntil: 'networkidle' });
  await a.getByLabel('Incorrecta').check();
  await a.fill('#motivo', 'Cálculo de prueba que se va a descartar.');
  await Promise.all([a.waitForURL(/calculo=/), a.getByRole('button', { name: 'Calcular el impacto' }).click()]);
  const revision = new URL(a.url()).searchParams.get('calculo');
  const descartar = await capturar(a, () => confirmar(a, a.getByRole('button', { name: 'Descartar sin aplicar' }), { campos: { motivo: 'Fue un cálculo de prueba.' } }));
  if (descartar) {
    for (const [quien, ctx] of [['alumna', ctxAlumna], ['visitante', anonimo]]) {
      const estado = await reenviar(ctx, descartar);
      comprobar(estado === 404 && sql(`select estado from public.revisiones_evaluacion where id = '${revision}'`) === 'calculada', `${quien}: descartar se rechaza (${estado})`);
    }
  } else comprobar(false, 'se capturó la solicitud de descarte');
  await a.goto(`${BASE}/admin/cursos/${C2}/evaluacion/${PREGUNTA}/revision?calculo=${revision}`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Descartar sin aplicar' }), { campos: { motivo: 'Fue un cálculo de prueba.' } });
  comprobar(await ve(a, /Revisión descartada/) && sql(`select estado from public.revisiones_evaluacion where id = '${revision}'`) === 'descartada'
    && await a.getByRole('heading', { name: 'Descartadas' }).isVisible(), 'la revisión queda descartada y listada, sin cambiar resultados');

  // 5. Bloqueo excepcional de un material desde el panel (y desbloqueo).
  const leccionMaterial = sql(`select r.leccion_id from public.recursos_leccion r join public.lecciones l on l.id = r.leccion_id join public.modulos m on m.id = l.modulo_id where m.curso_id = '${C1}' and r.titulo = 'Guía para observar en casa'`);
  await a.goto(`${BASE}/admin/cursos/${C1}/temario/${leccionMaterial}`, { waitUntil: 'networkidle' });
  await confirmar(a, a.locator('li', { hasText: 'Guía para observar en casa' }).getByRole('button', { name: 'Bloquear' }), { palabra: 'BLOQUEAR', campos: { motivo: 'El PDF tiene un dato equivocado.' } });
  comprobar(await ve(a, /Contenido bloqueado/) && await a.getByText('Bloqueado en todas las versiones').isVisible(), 'el material se bloquea en todas las versiones con motivo');
  await confirmar(a, a.locator('li', { hasText: 'Guía para observar en casa' }).getByRole('button', { name: 'Desbloquear' }), { palabra: 'DESBLOQUEAR', campos: { motivo: 'Ya se corrigió el dato del PDF.' } });
  comprobar(await ve(a, /Contenido desbloqueado/), 'y se desbloquea');

  // 6. Celular.
  const { p: m } = await sesion(ADMIN_CORREO, ADMIN_CLAVE, { width: 390, height: 844 });
  for (const [ruta, nombre] of [[`/admin/cursos/${C1}/vista-previa`, 'vista-previa'], [`/admin/cursos/${C1}/alumnos`, 'alumnos'], [`/admin/cursos/${C2}/evaluacion/${PREGUNTA}/revision`, 'revision']]) {
    await m.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    comprobar(await sinDesborde(m), `celular, ${nombre}: sin desborde horizontal`);
    await m.screenshot({ path: `${SALIDA}/movil-panel-cursos-${nombre}.png`, fullPage: true });
  }
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${a?.url()})`);
  await a?.screenshot({ path: `${SALIDA}/recorrido-panel-cursos-error.png`, fullPage: true }).catch(() => {});
}
for (const e of errores) console.log(`  error en consola: ${e}`);
comprobar(errores.length === 0, 'sin errores en la consola');
await navegador.close();
process.exit(fallas ? 1 : 0);
