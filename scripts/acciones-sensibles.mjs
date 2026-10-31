// Pruebas funcionales de autorización de las acciones sensibles (CI, Supabase local).
// 1) La admin ejecuta cada acción en el panel; la solicitud real se intercepta y se cancela antes de
//    llegar al servidor (no cambia nada). 2) Esa misma solicitud se reenvía con la sesión de la alumna
//    y sin sesión: la base y el almacenamiento deben quedar idénticos (huella antes y después de cada
//    intento) y la respuesta debe ser un 404 controlado, sin datos internos. 3) Control positivo: la
//    misma solicitud de «eliminar curso», reenviada por la admin, sí elimina el curso de prueba.
// Además: llamadas directas a la API de datos y al almacenamiento con el token de la alumna, y el
// cambio de versión manipulado (destino distinto, sin confirmar, sin sesión).
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE, PREGUNTA_C3, LECCION, API_URL, ANON_KEY } = process.env;
const C1 = 'c1000000-0000-0000-0000-000000000001';
const C2 = 'c1000000-0000-0000-0000-000000000002';
const C3 = 'c1000000-0000-0000-0000-000000000003';
const PRUEBA = '5a000000-0000-0000-0000-000000000001';

let fallas = 0;
const informe = [];
const comprobar = (ok, texto) => { const l = `${ok ? 'ok   ' : 'FALLA'} ${texto}`; console.log(l); informe.push(l); if (!ok) fallas++; };
const sql = (q) => execFileSync('psql', [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8' }).trim();

const HUELLA = `select md5(string_agg(t, '|' order by t)) from (
  select 'c'||id||estado||titulo||precio_centavos||coalesce(version_vigente_id::text,'')||coalesce(array_to_string(objetivos,','),'') t from public.cursos
  union all select 'm'||id||titulo||orden||retirado from public.modulos
  union all select 'l'||id||titulo||orden||retirada||bloqueada||coalesce(descripcion,'')||coalesce(video_id::text,'')||coalesce(duracion_minutos,-1) from public.lecciones
  union all select 'r'||id||titulo||retirado||bloqueado||complementario from public.recursos_leccion
  union all select 'e'||id||puntaje_minimo||coalesce(intentos_permitidos,-1) from public.evaluaciones
  union all select 'p'||id||enunciado||orden||retirada||bloqueada from public.preguntas
  union all select 'o'||id||texto||es_correcta from public.opciones
  union all select 'v'||id||numero from public.versiones_curso
  union all select 'vc'||version_id||recurso_id from public.version_complementos
  union all select 'rev'||id||estado from public.revisiones_evaluacion
  union all select 'i'||id||puntaje||coalesce(puntaje_revisado,-1) from public.intentos_evaluacion
  union all select 'a'||id||estado||version_id from public.accesos_curso
  union all select 'ce'||id||version_id from public.certificados
  union all select 'cv'||id from public.cambios_version
  union all select 'au'||count(*) from public.auditoria
  union all select 'so'||count(*) from storage.objects
  union all select 't'||id||estado||titulo||inicia_en||coalesce(cupo,-1)||precio_centavos||enlace_visible_horas from public.talleres
  union all select 'it'||id||estado||coalesce(asistio::text,'') from public.inscripciones_taller
  union all select 'ru'||id||enlace_participante||estado from public.reuniones
  union all select 're'||id||minutos_antes from public.recordatorios
  union all select 'in'||id||estado||coalesce(nota,'') from public.incidencias
  union all select 'no'||count(*) from public.notificaciones
) x`;
const huella = () => sql(HUELLA);

// Curso de prueba sin historial (se puede eliminar), con un material, una pregunta sin respuestas,
// un complemento en una lección publicada y una revisión calculada sin aplicar.
const ADMIN_ID = sql(`select id from auth.users where email = '${ADMIN_CORREO}'`);
const V1_C3 = sql(`select version_vigente_id from public.cursos where id = '${C3}'`);
const INCORRECTA = sql(`select id from public.opciones where pregunta_id = '${PREGUNTA_C3}' and texto = 'Incorrecta'`);
const REVISION = sql(`
  insert into public.cursos (id, slug, titulo, precio_centavos) values ('${PRUEBA}', 'prueba-permisos', '[Prueba] Permisos', 1000);
  insert into public.modulos (id, curso_id, titulo, orden) values ('5b000000-0000-0000-0000-000000000001', '${PRUEBA}', 'Módulo de prueba', 0);
  insert into public.lecciones (id, modulo_id, titulo, orden) values ('5c000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'Lección de prueba', 0);
  insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes) values
    ('5c000000-0000-0000-0000-000000000001', 'PDF de prueba', 'cursos/${PRUEBA}/prueba.pdf', 'application/pdf', 1000);
  insert into public.evaluaciones (id, curso_id) values ('5e000000-0000-0000-0000-000000000001', '${PRUEBA}');
  insert into public.preguntas (id, evaluacion_id, enunciado, tipo, orden) values ('5f000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'Pregunta de prueba', 'unica', 0);
  insert into public.opciones (pregunta_id, texto, es_correcta, orden) values ('5f000000-0000-0000-0000-000000000001', 'Sí', true, 0), ('5f000000-0000-0000-0000-000000000001', 'No', false, 1);
  insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes, complementario) values
    ('${LECCION}', 'Lectura complementaria', 'cursos/${C1}/complemento.pdf', 'application/pdf', 1000, true);
  insert into public.revisiones_evaluacion (version_id, pregunta_id, opciones_correctas, opciones_clave, motivo, calculada_por)
    values ('${V1_C3}', '${PREGUNTA_C3}', array['${INCORRECTA}']::uuid[], '${INCORRECTA}', 'Revisión de prueba para permisos.', '${ADMIN_ID}') returning id;
`).split('\n').pop();

// Taller de prueba publicado, gratuito, sin inscriptos (se puede eliminar, reprogramar, cancelar).
const TALLER = sql(`insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos)
  values ('permisos-taller', '[Prueba] Taller de permisos', 'Taller para probar permisos.', now() + interval '6 days', now() + interval '6 days 1 hour', 5, 0) returning id`).split('\n').pop();
sql(`update public.talleres set estado = 'publicado' where id = '${TALLER}'`);
const INCIDENCIA = sql(`insert into public.incidencias (tipo, taller_id, detalle) values ('pago_sin_cupo', '${TALLER}', '{"motivo":"sin_cupo"}') returning id`).split('\n').pop();

const navegador = await chromium.launch();
async function sesion(correo, clave) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await contexto.newPage();
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', correo);
  await p.fill('#contrasena', clave);
  await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  return { contexto, p };
}

/** Ejecuta un paso en el panel e intercepta la llamada a la acción (la cancela: no llega al servidor). */
async function capturar(p, paso, { permitir = 0 } = {}) {
  let capturada = null; let vistas = 0;
  const manejador = async (route, req) => {
    if (req.method() === 'POST' && req.headers()['next-action']) {
      if (vistas++ < permitir) return route.continue();
      capturada = { ruta: new URL(req.url()).pathname, accion: req.headers()['next-action'], tipo: req.headers()['content-type'],
        arbol: req.headers()['next-router-state-tree'], cuerpo: req.postDataBuffer() };
      return route.abort();
    }
    return route.continue();
  };
  await p.route('**/*', manejador);
  try {
    await paso();
    for (let i = 0; i < 100 && !capturada; i++) await p.waitForTimeout(100);
  } finally {
    await p.unroute('**/*', manejador);
  }
  return capturada;
}
async function confirmar(p, boton, { palabra, campos = {}, textoConfirmar } = {}) {
  const texto = (await boton.first().textContent()).trim();
  await boton.first().click();
  const dialogo = p.locator('dialog[open]');
  for (const [nombre, valor] of Object.entries(campos)) {
    const campo = dialogo.locator(`[name=${nombre}]`);
    if ((await campo.evaluate((e) => e.tagName)) === 'SELECT') await campo.selectOption(valor); else await campo.fill(valor);
  }
  if (palabra) await dialogo.locator('input[name=confirmacion]').fill(palabra);
  await dialogo.getByRole('button', { name: textoConfirmar ?? texto, exact: true }).click();
}
async function reenviar(contexto, c, ruta = c.ruta, cuerpo = c.cuerpo) {
  const r = await contexto.request.fetch(`${BASE}${ruta}`, {
    method: 'POST', maxRedirects: 0, data: cuerpo,
    headers: { 'Next-Action': c.accion, 'Content-Type': c.tipo, Accept: 'text/x-component', Origin: BASE, ...(c.arbol ? { 'Next-Router-State-Tree': c.arbol } : {}) },
  });
  return { estado: r.status(), texto: await r.text() };
}
const INTERNO = /es_correcta|enlace_anfitrion|service_role|SUPABASE|at \S+\.(js|ts):\d+|PostgrestError|stack|clave-admin|maestra\.demo/i;

const admin = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const alumna = await sesion(CORREO, CLAVE);
const anonimo = await navegador.newContext();
const pdf = `${SALIDA}/../permisos-prueba.pdf`;
await writeFile(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const p = admin.p;
const ir = (ruta) => p.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
const pasos = [
  ['Eliminar un curso', async () => { await ir(`/admin/cursos/${PRUEBA}/publicacion`); await confirmar(p, p.getByRole('button', { name: 'Eliminar el curso' }), { palabra: 'ELIMINAR' }); }],
  ['Eliminar una lección', async () => { await ir(`/admin/cursos/${PRUEBA}/temario`); await confirmar(p, p.locator('li', { hasText: 'Lección de prueba' }).getByRole('button', { name: 'Eliminar' }), { palabra: 'ELIMINAR' }); }],
  ['Eliminar un módulo', async () => { await ir(`/admin/cursos/${PRUEBA}/temario`); await confirmar(p, p.locator('section[aria-label^="Módulo 1"]').getByRole('button', { name: 'Eliminar' }).first(), { palabra: 'ELIMINAR' }); }],
  ['Eliminar una pregunta', async () => { await ir(`/admin/cursos/${PRUEBA}/evaluacion`); await confirmar(p, p.locator('li', { hasText: 'Pregunta de prueba' }).getByRole('button', { name: 'Eliminar' }), { palabra: 'ELIMINAR' }); }],
  ['Quitar un material', async () => { await ir(`/admin/cursos/${PRUEBA}/temario/5c000000-0000-0000-0000-000000000001`); await confirmar(p, p.getByRole('button', { name: 'Quitar' }), { textoConfirmar: 'Quitar' }); }],
  ['Subir un archivo (preparar la subida)', async () => {
    await ir(`/admin/cursos/${PRUEBA}/temario/5c000000-0000-0000-0000-000000000001`);
    await p.setInputFiles('#pdf', pdf); await p.getByLabel(/Complementario\./).check(); await p.getByRole('button', { name: 'Subir PDF' }).click();
  }],
  ['Subir un archivo (registrar lo subido)', async () => {
    await ir(`/admin/cursos/${PRUEBA}/temario/5c000000-0000-0000-0000-000000000001`);
    await p.setInputFiles('#pdf', pdf); await p.getByLabel(/Complementario\./).check(); await p.getByRole('button', { name: 'Subir PDF' }).click();
  }, { permitir: 1 }],
  ['Aplicar una revisión favorable', async () => {
    await ir(`/admin/cursos/${C3}/evaluacion/${PREGUNTA_C3}/revision?calculo=${REVISION}`);
    await p.fill('#confirmar-revision', 'CORREGIR 0'); await p.getByRole('button', { name: 'Aplicar la revisión favorable' }).click();
  }],
  ['Calcular una revisión favorable', async () => {
    await ir(`/admin/cursos/${C3}/evaluacion/${PREGUNTA_C3}/revision`);
    await p.getByLabel('Incorrecta').check(); await p.fill('#motivo', 'Motivo suficiente para la prueba.'); await p.getByRole('button', { name: 'Calcular el impacto' }).click();
  }],
  ['Bloquear contenido', async () => { await ir(`/admin/cursos/${C1}/temario/${LECCION}`); await confirmar(p, p.getByRole('button', { name: 'Bloquear la lección' }), { palabra: 'BLOQUEAR', campos: { motivo: 'Motivo suficiente para la prueba.' } }); }],
  ['Publicar una versión', async () => { await ir(`/admin/cursos/${C2}/publicacion`); await confirmar(p, p.getByRole('button', { name: /Publicar la versión/ }), { palabra: 'PUBLICAR', campos: { resumen: 'Resumen de prueba.' } }); }],
  ['Cambiar criterios académicos', async () => { await ir(`/admin/cursos/${C2}/evaluacion`); await p.fill('#puntaje', '99'); await p.getByRole('button', { name: 'Guardar criterios' }).click(); }],
  ['Archivar un curso', async () => { await ir(`/admin/cursos/${C1}/publicacion`); await confirmar(p, p.getByRole('button', { name: 'Archivar' }), { palabra: 'ARCHIVAR' }); }],
  ['Corrección menor de una lección publicada', async () => {
    await ir(`/admin/cursos/${C1}/temario/${LECCION}`);
    await p.selectOption('#tipo_correccion', 'ortografia'); await p.fill('#motivo', 'Motivo suficiente para la prueba.');
    await p.getByRole('button', { name: 'Aplicar corrección menor' }).click();
  }],
  ['Crear una lección de reemplazo', async () => { await ir(`/admin/cursos/${C1}/temario/${LECCION}`); await confirmar(p, p.getByRole('button', { name: 'Crear lección de reemplazo' }), { palabra: 'REEMPLAZAR' }); }],
  ['Asociar un material complementario', async () => {
    await ir(`/admin/cursos/${C1}/temario/${LECCION}`);
    await p.getByLabel('Versión 1').first().check(); await p.getByRole('button', { name: 'Guardar versiones' }).click();
  }],
  ['Corregir el nombre de un módulo publicado', async () => {
    await ir(`/admin/cursos/${C1}/temario`);
    await confirmar(p, p.getByRole('button', { name: 'Corregir nombre' }), { textoConfirmar: 'Aplicar corrección', campos: { tipo_correccion: 'ortografia', motivo: 'Motivo suficiente para la prueba.' } });
  }],
  ['Crear un taller', async () => { await ir('/admin/talleres'); await p.fill('#titulo', 'Taller no autorizado'); await p.fill('#fecha', '2030-01-10'); await p.fill('#hora', '18:00'); await p.getByRole('button', { name: 'Crear taller' }).click(); }],
  ['Editar un taller', async () => { await ir(`/admin/talleres/${TALLER}`); await p.fill('#titulo', 'Título no autorizado'); await p.getByRole('button', { name: 'Guardar cambios' }).click(); }],
  ['Eliminar un taller', async () => {
    sql(`update public.talleres set estado = 'borrador' where id = '${TALLER}'`);
    await ir(`/admin/talleres/${TALLER}/estado`); await confirmar(p, p.getByRole('button', { name: 'Eliminar el taller' }), { palabra: 'ELIMINAR' });
    sql(`update public.talleres set estado = 'publicado' where id = '${TALLER}'`);
  }],
  ['Reprogramar un taller', async () => { await ir(`/admin/talleres/${TALLER}/estado`); await confirmar(p, p.getByRole('button', { name: 'Reprogramar' }), { palabra: 'REPROGRAMAR', campos: { fecha: '2030-02-10', motivo: 'Motivo suficiente para la prueba.' } }); }],
  ['Cancelar un taller', async () => { await ir(`/admin/talleres/${TALLER}/estado`); await confirmar(p, p.getByRole('button', { name: 'Cancelar el taller' }), { palabra: 'CANCELAR', campos: { motivo: 'Motivo suficiente para la prueba.' } }); }],
  ['Duplicar un taller', async () => { await ir(`/admin/talleres/${TALLER}/estado`); await confirmar(p, p.getByRole('button', { name: 'Duplicar el taller' }), { textoConfirmar: 'Crear la copia' }); }],
  ['Cargar el enlace de una videollamada', async () => { await ir(`/admin/talleres/${TALLER}/videollamada`); await p.fill('#participante', 'https://intruso.example.invalid'); await p.getByRole('button', { name: 'Guardar enlace' }).click(); }],
  ['Cambiar recordatorios', async () => { await ir(`/admin/talleres/${TALLER}/videollamada`); await p.getByLabel('7 días antes').check(); await p.getByRole('button', { name: 'Guardar recordatorios' }).click(); }],
  ['Inscribir por cortesía', async () => { await ir(`/admin/talleres/${TALLER}/participantes`); await p.fill('#correo', CORREO); await p.fill('#motivo-cortesia', 'Motivo suficiente para la prueba.'); await p.getByRole('button', { name: 'Inscribir' }).click(); }],
  ['Anotar una incidencia', async () => { await ir('/admin/talleres/incidencias'); await p.getByLabel('Nota interna').first().fill('Nota de prueba.'); await p.getByRole('button', { name: 'Guardar nota' }).first().click(); }],
  ['Crear un curso', async () => { await ir('/admin/cursos'); await p.fill('#titulo', 'Curso no autorizado'); await p.getByRole('button', { name: 'Crear curso' }).click(); }],
];

const capturadas = [];
try {
  for (const [nombre, paso, opciones] of pasos) {
    try {
      const c = await capturar(p, paso, opciones);
      comprobar(Boolean(c), `se capturó la solicitud real del panel: ${nombre}`);
      if (c) capturadas.push([nombre, c]);
    } catch (e) {
      comprobar(false, `${nombre}: ${String(e.message).split('\n')[0]}`);
      await p.screenshot({ path: `${SALIDA}/permisos-error-${capturadas.length}.png`, fullPage: true }).catch(() => {});
    }
  }
  comprobar(new Set(capturadas.map(([, c]) => c.accion)).size >= 25, `acciones distintas capturadas: ${new Set(capturadas.map(([, c]) => c.accion)).size}`);

  for (const [nombre, c] of capturadas) {
    // Se reenvía a la misma ruta del panel donde la acción está registrada (en otra ruta Next.js ni
    // siquiera la ejecuta, y eso no probaría nada).
    for (const [quien, contexto, ruta] of [['alumna', alumna.contexto, c.ruta], ['visitante', anonimo, c.ruta]]) {
      const antes = huella();
      const r = await reenviar(contexto, c, ruta);
      const despues = huella();
      informe.push(`      ${quien} → ${r.estado} · ${nombre}`);
      comprobar(antes === despues && r.estado === 404 && !INTERNO.test(r.texto),
        `${quien}: «${nombre}» rechazada con ${r.estado}, sin cambios${INTERNO.test(r.texto) ? ' (¡con datos internos!)' : ''}`);
    }
  }
  const bloqueo = capturadas.find(([n]) => n === 'Bloquear contenido');
  if (bloqueo) {
    const antes = huella();
    const r = await reenviar(alumna.contexto, bloqueo[1], bloqueo[1].ruta, Buffer.from(bloqueo[1].cuerpo.toString('utf8').replace(/\r\n\r\nsi\r\n/, '\r\n\r\nno\r\n')));
    comprobar(antes === huella() && r.estado === 404, 'alumna: desbloquear también se rechaza');
  }

  // Control positivo: la misma solicitud reenviada por la admin sí actúa.
  const eliminar = capturadas.find(([n]) => n === 'Eliminar un curso');
  if (eliminar) {
    await reenviar(admin.contexto, eliminar[1]);
    comprobar(sql(`select count(*) from public.cursos where id = '${PRUEBA}'`) === '0', 'control positivo: la misma solicitud enviada por la admin elimina el curso de prueba');
  }

  // API de datos y almacenamiento con el token de la alumna.
  if (API_URL && ANON_KEY) {
    const token = (await (await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: CORREO, password: CLAVE }),
    })).json()).access_token;
    const api = (ruta, init = {}) => fetch(`${API_URL}${ruta}`, { ...init, headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const antes = huella();
    const correctas = await api('/rest/v1/opciones?select=id,es_correcta');
    comprobar(correctas.status >= 400 && !(await correctas.text()).includes('"es_correcta":true'), `API: la alumna no lee respuestas correctas (${correctas.status})`);
    const anfitrion = await api('/rest/v1/reuniones?select=enlace_anfitrion');
    comprobar(anfitrion.status >= 400, `API: la alumna no lee enlaces de anfitrión (${anfitrion.status})`);
    const video = await api('/rest/v1/lecciones?select=video_id');
    comprobar(video.status >= 400, `API: la alumna no lee los id de video privados (${video.status})`);
    await api(`/rest/v1/cursos?id=eq.${C1}`, { method: 'PATCH', body: JSON.stringify({ precio_centavos: 1 }) });
    await api(`/rest/v1/intentos_evaluacion?perfil_id=neq.00000000-0000-0000-0000-000000000000`, { method: 'PATCH', body: JSON.stringify({ puntaje: 100, aprobado: true }) });
    await api('/rest/v1/certificados', { method: 'POST', body: JSON.stringify({ curso_id: C3, nombre_en_certificado: 'X', titulo_curso: 'X' }) });
    const rpc = {};
    for (const [f, cuerpo] of [
      ['publicar_version', { p_curso: C1, p_resumen: 'No autorizado' }],
      ['aplicar_revision', { p_revision: REVISION, p_confirmacion: 'CORREGIR 0' }],
      ['bloquear_contenido', { p_tabla: 'lecciones', p_id: LECCION, p_bloquear: true, p_motivo: 'Motivo suficiente.' }],
      ['reemplazar_leccion', { p_leccion: LECCION }],
      ['corregir_modulo_publicado', { p_modulo: '00000000-0000-0000-0000-000000000000', p_titulo: 'X', p_tipo: 'ortografia', p_motivo: 'Motivo suficiente.' }],
      ['cambiar_version', { p_perfil: '00000000-0000-0000-0000-000000000000', p_curso: C1, p_version_destino: V1_C3, p_confirmacion: 'Entiendo qué cambia' }],
      ['emitir_certificado', { p_perfil: '00000000-0000-0000-0000-000000000000', p_curso: C3 }],
    ]) rpc[f] = (await api(`/rest/v1/rpc/${f}`, { method: 'POST', body: JSON.stringify(cuerpo) })).status;
    comprobar(Object.values(rpc).every((s) => s >= 400), `API: funciones administrativas rechazadas para la alumna ${JSON.stringify(rpc)}`);
    const subida = await fetch(`${API_URL}/storage/v1/object/materiales/cursos/${C1}/intruso.pdf`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 intruso',
    });
    comprobar(subida.status >= 400, `almacenamiento: la alumna no sube archivos al bucket privado (${subida.status})`);
    const borrado = await fetch(`${API_URL}/storage/v1/object/materiales`, {
      method: 'DELETE', headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [`cursos/${C1}/complemento.pdf`] }),
    });
    const lista = await fetch(`${API_URL}/storage/v1/object/list/materiales`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: 'cursos' }),
    });
    const listado = lista.ok ? await lista.json() : [];
    comprobar(Array.isArray(listado) && listado.length === 0, `almacenamiento: la alumna no lista archivos administrativos (${lista.status}, borrar → ${borrado.status})`);
    comprobar(antes === huella(), 'la base y el almacenamiento no cambiaron tras los intentos directos (cursos, intentos, certificados, archivos)');
  } else {
    comprobar(false, 'faltan API_URL y ANON_KEY para probar la API y el almacenamiento');
  }

  // Cambio de versión manipulado: la maestra publica una versión 2 de c1 (servidor), la alumna tiene la opción.
  sql(`select public.publicar_version('${C1}', 'Versión de prueba para el cambio manipulado')`);
  const v1 = sql(`select id from public.versiones_curso where curso_id = '${C1}' and numero = 1`);
  const pa = alumna.p;
  await pa.goto(`${BASE}/campus/cursos/demo-montessori-en-casa/version`, { waitUntil: 'networkidle' });
  comprobar(await pa.getByText(/no podrá volver a la versión 1/).isVisible(), 'la página de cambio informa que no se puede volver atrás');
  const cambio = await capturar(pa, async () => { await pa.getByLabel(/Entiendo qué cambia/).check(); await pa.getByRole('button', { name: /Pasar a la versión/ }).click(); });
  comprobar(Boolean(cambio), 'se capturó la solicitud de cambio de versión');
  if (cambio) {
    const texto = cambio.cuerpo.toString('utf8');
    informe.push(`      cuerpo capturado del cambio de versión: ${JSON.stringify(texto.slice(0, 700))}`);
    const destino = texto.match(/destino"\r?\n\r?\n([0-9a-f-]{36})/)?.[1] ?? texto.match(/"destino"\s*[:,]\s*"([0-9a-f-]{36})"/)?.[1];
    comprobar(Boolean(destino), 'la solicitud capturada lleva el destino');
    if (!destino) throw new Error('sin destino en la solicitud capturada');
    comprobar(/name="[^"]*entiendo"/.test(texto), 'la solicitud capturada lleva la casilla de confirmación');
    const variantes = [
      ['destino anterior (versión 1)', texto.replace(destino, v1)],
      ['destino inexistente', texto.replace(destino, '00000000-0000-0000-0000-000000000000')],
      ['sin la casilla de confirmación', texto.replace(/--[^\r\n]*\r\nContent-Disposition: form-data; name="[^"]*entiendo"\r\n\r\nsi\r\n/, '')],
    ];
    for (const [nombre, cuerpo] of variantes) {
      const antes = huella();
      await reenviar(alumna.contexto, cambio, cambio.ruta, Buffer.from(cuerpo));
      comprobar(antes === huella(), `cambio de versión manipulado (${nombre}): no cambia nada`);
    }
    const antes = huella();
    const r = await reenviar(anonimo, cambio);
    comprobar(antes === huella() && r.estado !== 200, `cambio de versión sin sesión: rechazado (${r.estado})`);
    comprobar(sql(`select v.numero from public.accesos_curso a join public.versiones_curso v on v.id = a.version_id join auth.users u on u.id = a.perfil_id
                   where u.email = '${CORREO}' and a.curso_id = '${C1}'`) === '1', 'la alumna sigue en la versión 1 de c1');
  }
  const ajena = await alumna.contexto.request.get(`${BASE}/campus/cursos/curso-que-no-compro/version`);
  comprobar(ajena.status() === 404, `página de cambio de un curso sin acceso: ${ajena.status()}`);
} catch (e) {
  comprobar(false, String(e.message).split('\n').slice(0, 6).join(' | '));
}
await writeFile(`${SALIDA}/acciones-sensibles.txt`, informe.join('\n') + '\n');
await navegador.close();
process.exit(fallas ? 1 : 0);
