// Prueba directa de las acciones protegidas del panel (CI, Supabase local).
// Toma los formularios reales del panel (con la sesión de la admin), los reenvía tal cual con la
// sesión de la alumna y comprueba que la base de datos no cambió en nada. Se envían a /campus, una
// ruta que la alumna sí puede abrir: así no los frena la página del panel sino la propia acción.
// Control positivo: el mismo reenvío con la sesión de la admin sí cambia la base (bloqueo y desbloqueo).
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE, PREGUNTA, PREGUNTA_C3, LECCION } = process.env;
const C1 = 'c1000000-0000-0000-0000-000000000001';
const C2 = 'c1000000-0000-0000-0000-000000000002';
const C3 = 'c1000000-0000-0000-0000-000000000003';

let fallas = 0;
const informe = [];
const comprobar = (ok, texto) => { const l = `${ok ? 'ok   ' : 'FALLA'} ${texto}`; console.log(l); informe.push(l); if (!ok) fallas++; };
const sql = (q) => execFileSync('psql', [DB, '-tA', '-c', q], { encoding: 'utf8' }).trim();

// Huella de todo lo que una acción del panel podría cambiar.
const HUELLA = `select md5(string_agg(t, '|' order by t)) from (
  select 'c'||id||estado||titulo||precio_centavos||coalesce(version_vigente_id::text,'') t from public.cursos
  union all select 'm'||id||titulo||orden||retirado from public.modulos
  union all select 'l'||id||titulo||orden||retirada||bloqueada||coalesce(descripcion,'')||coalesce(video_id::text,'') from public.lecciones
  union all select 'r'||id||titulo||retirado||bloqueado from public.recursos_leccion
  union all select 'e'||id||puntaje_minimo||coalesce(intentos_permitidos,-1) from public.evaluaciones
  union all select 'p'||id||enunciado||orden||retirada||bloqueada||coalesce(tema,'') from public.preguntas
  union all select 'o'||id||texto||es_correcta from public.opciones
  union all select 'v'||id||numero from public.versiones_curso
  union all select 'vl'||version_id||leccion_id from public.version_lecciones
  union all select 'vp'||version_id||pregunta_id from public.version_preguntas
  union all select 'rev'||id||estado from public.revisiones_evaluacion
  union all select 'aj'||revision_id||intento_id from public.ajustes_intento
  union all select 'i'||id||puntaje||coalesce(puntaje_revisado,-1) from public.intentos_evaluacion
  union all select 'a'||id||estado||version_id from public.accesos_curso
  union all select 'ce'||id||version_id from public.certificados
  union all select 'cv'||id from public.cambios_version
  union all select 'au'||count(*) from public.auditoria
) x`;

const navegador = await chromium.launch();
async function sesion(correo, clave) {
  const contexto = await navegador.newContext();
  const p = await contexto.newPage();
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', correo);
  await p.fill('#contrasena', clave);
  await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  await p.close();
  return contexto;
}

const atributo = (tag, nombre) => tag.match(new RegExp(`\\s${nombre.replace('$', '\\$')}="([^"]*)"`))?.[1];
const desescapar = (v) => v?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Formularios con acción del servidor, con sus campos completados como lo haría la admin. */
function formularios(html, pagina) {
  const salida = [];
  for (const [, cuerpo] of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)) {
    if (!/\$ACTION_(ID|REF)_/.test(cuerpo)) continue;
    const campos = [];
    for (const [tag] of cuerpo.matchAll(/<input\b[^>]*>/g)) {
      const nombre = desescapar(atributo(tag, 'name'));
      const tipo = atributo(tag, 'type') ?? 'text';
      if (!nombre || tipo === 'submit' || tipo === 'file') continue;
      if ((tipo === 'checkbox' || tipo === 'radio') && campos.some(([n]) => n === nombre)) continue;
      campos.push([nombre, desescapar(atributo(tag, 'value')) ?? (nombre === 'titulo' ? 'Cambio no autorizado' : 'x')]);
    }
    for (const [, attrs, contenido] of cuerpo.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
      const nombre = atributo(attrs, 'name');
      if (nombre) campos.push([nombre, desescapar(contenido) || 'Texto suficiente para pasar la validación del motivo.']);
    }
    for (const [, attrs, opciones] of cuerpo.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const nombre = atributo(attrs, 'name');
      const valor = opciones.match(/value="([^"]*)"/)?.[1];
      if (nombre && valor) campos.push([nombre, valor]);
    }
    const palabra = cuerpo.match(/[Ee]scriba (?:<!-- -->)?([A-ZÁÉÍÓÚ]+(?:(?:<!-- -->)? ?\d+)?)(?:<!-- -->)? para (?:confirmar|aplicar)/)?.[1]
      ?? cuerpo.match(/escriba CORREGIR (?:<!-- -->)?(\d+)/)?.[1]?.replace(/^/, 'CORREGIR ');
    if (palabra) {
      const limpia = palabra.replace(/<!-- -->/g, '');
      const i = campos.findIndex(([n]) => n === 'confirmacion');
      if (i >= 0) campos[i][1] = limpia; else campos.push(['confirmacion', limpia]);
    }
    const id = cuerpo.match(/name="\$ACTION_ID_([0-9a-f]+)"/)?.[1] ?? 'ref';
    const visibles = campos.filter(([n]) => !n.startsWith('$')).map(([n, v]) => `${n}=${v.slice(0, 24)}`).join(' ');
    salida.push({ pagina, id, campos, descripcion: `${pagina} · ${id.slice(0, 10)} · ${visibles}` });
  }
  return salida;
}

async function enviar(contexto, f, ruta = '/campus') {
  const r = await contexto.request.fetch(`${BASE}${ruta}`, {
    method: 'POST', headers: { Origin: BASE }, maxRedirects: 0, multipart: Object.fromEntries(f.campos),
  });
  return r.status();
}

const admin = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const alumna = await sesion(CORREO, CLAVE);
try {
  const paginas = [
    '/admin/cursos', `/admin/cursos/${C1}`, `/admin/cursos/${C1}/temario`, `/admin/cursos/${C1}/temario/${LECCION}`,
    `/admin/cursos/${C1}/publicacion`, `/admin/cursos/${C2}/publicacion`, `/admin/cursos/${C2}/evaluacion`,
    `/admin/cursos/${C2}/evaluacion/${PREGUNTA}`, `/admin/cursos/${C3}/evaluacion/${PREGUNTA_C3}/revision`, `/admin/cursos/${C3}/publicacion`,
  ];
  const todos = [];
  for (const pagina of paginas) {
    const r = await admin.request.get(`${BASE}${pagina}`);
    comprobar(r.status() === 200, `la admin abre ${pagina} (${r.status()})`);
    todos.push(...formularios(await r.text(), pagina));
  }
  // Se descartan las acciones que la alumna también recibe en su campus (por ejemplo «Cerrar sesión»
  // del encabezado común): son suyas y reenviarlas solo cerraría su propia sesión.
  const propias = new Set();
  for (const ruta of ['/campus', '/campus/cursos/demo-montessori-en-casa', '/campus/cuenta']) {
    for (const f of formularios(await (await alumna.request.get(`${BASE}${ruta}`)).text(), ruta)) propias.add(f.id);
  }
  const delPanel = todos.filter((f) => f.id === 'ref' || !propias.has(f.id));
  const descartados = todos.length - delPanel.length;
  todos.length = 0; todos.push(...delPanel);
  const ids = new Set(todos.map((f) => f.id));
  comprobar(todos.length >= 25 && ids.size >= 9,
    `formularios reales del panel: ${todos.length}, acciones distintas: ${ids.size} (${descartados} descartados por ser también del campus)`);

  // 1. Con la sesión de la alumna, ningún reenvío cambia la base.
  const antes = sql(HUELLA);
  const estados = new Map();
  for (const f of todos) {
    const estado = await enviar(alumna, f);
    estados.set(estado, (estados.get(estado) ?? 0) + 1);
    informe.push(`      alumna → ${estado} · ${f.descripcion}`);
    comprobar(estado >= 400, `alumna: ${f.descripcion} → ${estado}`);
  }
  const despues = sql(HUELLA);
  const sigue = await alumna.request.get(`${BASE}/campus`, { maxRedirects: 0 });
  comprobar(sigue.status() === 200, `la sesión de la alumna siguió activa durante toda la prueba (${sigue.status()})`);
  comprobar(antes === despues, `la base no cambió tras ${todos.length} reenvíos de la alumna (huella ${antes.slice(0, 12)})`);
  comprobar(![...estados.keys()].some((e) => e < 400), `todas las respuestas a la alumna fueron rechazos (${JSON.stringify([...estados])})`);

  // 2. Lo mismo sin sesión.
  const anonimo = await navegador.newContext();
  // A la portada (pública): sin sesión, el middleware del campus no la frenaría antes de la acción.
  for (const f of todos.slice(0, 12)) await enviar(anonimo, f, '/');
  comprobar(sql(HUELLA) === antes, 'tampoco cambia sin sesión');
  await anonimo.close();

  // 3. Control positivo: el mismo reenvío con la sesión de la admin sí funciona.
  const bloqueo = todos.find((f) => f.campos.some(([n, v]) => n === 'bloquear' && v === 'si') && f.campos.some(([n, v]) => n === 'id' && v === LECCION));
  comprobar(Boolean(bloqueo), 'se encontró el formulario de bloqueo de la lección');
  if (bloqueo) {
    const estado = await enviar(admin, bloqueo, `/admin/cursos/${C1}/temario/${LECCION}`);
    const bloqueada = sql(`select bloqueada from public.lecciones where id = '${LECCION}'`);
    comprobar(bloqueada === 't', `control positivo: el mismo formulario enviado por la admin bloquea la lección (${estado})`);
    const html = await (await admin.request.get(`${BASE}/admin/cursos/${C1}/temario/${LECCION}`)).text();
    const desbloqueo = formularios(html, 'lección').find((f) => f.campos.some(([n, v]) => n === 'bloquear' && v === 'no'));
    if (desbloqueo) await enviar(admin, desbloqueo, `/admin/cursos/${C1}/temario/${LECCION}`);
    comprobar(sql(`select bloqueada from public.lecciones where id = '${LECCION}'`) === 'f', 'control positivo: y la desbloquea');
    comprobar(sql(`select count(*) from public.auditoria where accion in ('contenido_bloqueado','contenido_desbloqueado') and entidad_id = '${LECCION}'`) >= '2',
      'el bloqueo y el desbloqueo quedaron registrados');
  }

} catch (e) {
  comprobar(false, String(e.message).split('\n').slice(0, 6).join(' | '));
}
await writeFile(`${SALIDA}/acciones-protegidas.txt`, informe.join('\n') + '\n');
await navegador.close();
process.exit(fallas ? 1 : 0);
