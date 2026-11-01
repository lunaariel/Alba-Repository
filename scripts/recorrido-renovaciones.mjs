// Recorrido de períodos de acceso (correcciones D1–D7, 01/11/2026) en CI. Corre después de recorrido-vencimientos,
// que deja a la segunda alumna con el curso de ejemplo vencido.
//  1. Campus vencido: oferta de renovación con precio y condiciones vigentes, sin botón de compra (ventas cerradas).
//  2. Renovación simulada (pasarela simulada, sin dinero): misma inscripción, misma versión, período nuevo.
//  3. Certificado con el acceso vencido: quien cumplió todo antes de vencer lo obtiene desde el campus (D6).
//  4. Becas en el panel: otorgar con fecha de fin y revocar, con motivo y responsable (D3).
//  5. Permisos por la API: una alumna no otorga becas ni lee períodos.
//  6. Talleres apagados: el sitio no los muestra ni admite inscripciones; el panel informa el estado.
//  7. Conciliación de accesos y períodos, y celular.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO, CLAVE, CORREO2, CLAVE2, ADMIN_CORREO, ADMIN_CLAVE, API_URL, ANON_KEY } = process.env;
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
const C1 = 'c1000000-0000-0000-0000-000000000001';
// Paso del tiempo, solo en pruebas: corre hacia atrás el acceso y todos sus períodos, juntos.
const envejecer = (perfil, meses) => sql(`begin;
  alter table public.periodos_acceso disable trigger periodos_inmutables;
  update public.periodos_acceso set inicia_en = inicia_en - interval '${meses} months', vence_en = vence_en - interval '${meses} months' where perfil_id = '${perfil}' and curso_id = '${C1}';
  alter table public.periodos_acceso enable trigger periodos_inmutables;
  select set_config('albor.ajuste_vencimiento', 'si', true);
  update public.accesos_curso set inicia_en = inicia_en - interval '${meses} months', vence_en = vence_en - interval '${meses} months' where perfil_id = '${perfil}' and curso_id = '${C1}';
  commit;`);

const { p: a } = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const { contexto: ctx2, p: al2 } = await sesion(CORREO2, CLAVE2);
const alumna2 = sql(`select id from auth.users where email = '${CORREO2}'`);
try {
  // ---------------------------------------------------------------- 1. Oferta de renovación
  const acceso = sql(`select id || '|' || version_id from public.accesos_curso where perfil_id = '${alumna2}' and curso_id = '${C1}' and estado = 'activo'`);
  const [accesoId, version] = acceso.split('|');
  comprobar(Boolean(accesoId) && sql(`select (vence_en <= now())::text from public.accesos_curso where id = '${accesoId}'`) === 'true', 'punto de partida: el curso está vencido');
  await al2.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  const tarjeta = al2.locator('li', { hasText: 'Montessori en casa' });
  comprobar(await tarjeta.getByText('Renovar el acceso').isVisible() && await tarjeta.getByText(/Precio vigente USD 49/).isVisible()
    && await tarjeta.getByText(/4 meses de duración más 5 meses adicionales, en total 9 meses/).isVisible()
    && await tarjeta.getByText(/Si el pago se confirmara hoy, tendría acceso hasta el/).isVisible(),
  'el curso vencido muestra el precio y las condiciones vigentes antes de renovar');
  comprobar(await tarjeta.getByText('Las compras abren pronto.').isVisible() && (await tarjeta.getByRole('link', { name: 'Renovar' }).count()) === 0,
    'con las ventas cerradas no hay botón de compra');
  await al2.screenshot({ path: `${SALIDA}/recorrido-renovaciones-1-oferta.png`, fullPage: true });

  // ---------------------------------------------------------------- 2. Renovación simulada
  const orden = sql(`select public.crear_orden('${alumna2}', 'curso', '${C1}')`);
  comprobar(sql(`select condiciones_acceso ->> 'total_meses' from public.items_orden where orden_id = '${orden}'`) === '9', 'la orden de renovación congela la oferta vigente (9 meses)');
  const resultado = sql(`select public.procesar_evento_pago('simulado', 'renov-evt', 'pago', '{}', '${orden}', 'renov-pago', 'aprobado', 4900)`);
  comprobar(resultado === 'procesado', `renovación procesada por la pasarela simulada (${resultado})`);
  comprobar(sql(`select count(*) from public.accesos_curso where perfil_id = '${alumna2}' and curso_id = '${C1}'`) === '1'
    && sql(`select id || '|' || version_id from public.accesos_curso where perfil_id = '${alumna2}' and curso_id = '${C1}' and estado = 'activo'`) === acceso,
  'misma inscripción académica y misma versión');
  comprobar(sql(`select count(*) from public.periodos_acceso where acceso_id = '${accesoId}' and estado = 'activo'`) === '2', 'la compra anterior conserva su período; la nueva suma otro');
  await al2.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  comprobar(await al2.locator('li', { hasText: 'Montessori en casa' }).getByText(/Acceso hasta el/).first().isVisible()
    && (await al2.getByRole('heading', { name: 'Cursos con el acceso vencido' }).count()) === 0, 'renovado: el curso vuelve a estar disponible en el campus');
  const pagina = await ctx2.request.get(`${BASE}/campus/cursos/demo-montessori-en-casa`);
  comprobar(pagina.status() === 200, `renovado: el contenido vuelve a abrirse (${pagina.status()})`);
  await al2.screenshot({ path: `${SALIDA}/recorrido-renovaciones-2-renovado.png`, fullPage: true });

  // ---------------------------------------------------------------- 3. Certificado después de vencer (D6)
  // Completa su versión mientras tiene acceso (por las funciones del servidor) y no pide el certificado.
  sql(`insert into public.progreso_leccion (perfil_id, leccion_id, completada_en)
       select '${alumna2}', l, now() from public.lecciones_de_version('${version}') l
       on conflict (perfil_id, leccion_id) do update set completada_en = now()`);
  sql(`select public.corregir_evaluacion('${alumna2}', (select id from public.evaluaciones where curso_id = '${C1}'),
         (select jsonb_object_agg(vp.pregunta_id, (select jsonb_agg(o.id) from public.opciones o where o.pregunta_id = vp.pregunta_id and o.es_correcta))
            from public.version_preguntas vp where vp.version_id = '${version}'))`);
  comprobar(sql(`select public.estado_finalizacion_de('${alumna2}', '${C1}') ->> 'elegible_certificado'`) === 'true', 'cumplió todos los requisitos antes de vencer');
  envejecer(alumna2, 20);
  await al2.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  const vencida = al2.locator('li', { hasText: 'Montessori en casa' });
  comprobar(await vencida.getByText(/Completó el curso antes del vencimiento/).isVisible(), 'con el acceso vencido, el campus ofrece obtener el certificado');
  await vencida.getByRole('button', { name: 'Obtener mi certificado' }).click();
  await al2.getByText('Su certificado está listo.', { exact: false }).waitFor({ timeout: 15000 });
  const cert = sql(`select id from public.certificados where perfil_id = '${alumna2}' and curso_id = '${C1}'`);
  const pdf = await ctx2.request.get(`${BASE}/campus/certificados/${cert}`);
  comprobar(Boolean(cert) && pdf.status() === 200 && (pdf.headers()['content-type'] ?? '').includes('pdf'), `el certificado se emite y se descarga (${pdf.status()})`);
  comprobar(await al2.locator('li', { hasText: 'Montessori en casa' }).getByRole('link', { name: 'descargar' }).isVisible(), 'el campus vencido muestra el certificado para descargar');
  const codigo = sql(`select codigo_verificacion from public.certificados where id = '${cert}'`);
  const verificacion = await (await navegador.newContext()).request.get(`${BASE}/verificar/${codigo}`);
  comprobar(verificacion.status() === 200, `la verificación pública del certificado funciona con el acceso vencido (${verificacion.status()})`);
  const contenido = await ctx2.request.get(`${BASE}/campus/cursos/demo-montessori-en-casa`);
  comprobar(contenido.status() === 404, `el contenido sigue protegido (${contenido.status()})`);
  await al2.screenshot({ path: `${SALIDA}/recorrido-renovaciones-3-certificado.png`, fullPage: true });

  // ---------------------------------------------------------------- 4. Beca en el panel
  await a.goto(`${BASE}/admin/cursos/${C1}/alumnos`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(/Compra \(USD 49\)/).first().isVisible(), 'el panel muestra los períodos de cada persona');
  const fin = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  await a.getByRole('button', { name: 'Otorgar una beca' }).click();
  const dialogo = a.locator('dialog[open]');
  await dialogo.locator('input[name=correo]').fill(CORREO2);
  await dialogo.locator('input[name=fin]').fill(fin);
  await dialogo.locator('textarea[name=motivo]').fill('Beca de prueba por continuidad del recorrido');
  await dialogo.locator('input[name=responsable]').fill('Maestra titular');
  let pedido = null;   // la solicitud real de la acción, para reenviarla luego con otras sesiones
  const escuchar = (req) => { if (!pedido && req.method() === 'POST' && req.headers()['next-action']) pedido = { url: req.url(), cabeceras: req.headers(), cuerpo: req.postDataBuffer() }; };
  a.on('request', escuchar);
  await dialogo.getByRole('button', { name: 'Otorgar una beca' }).click();
  comprobar(await a.getByText(/Beca otorgada/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'la admin otorga una beca con fecha de fin');
  a.off('request', escuchar);
  // La misma solicitud, reenviada con la sesión de la alumna y sin sesión: no otorga nada.
  const becas = () => sql(`select count(*) from public.periodos_acceso where perfil_id = '${alumna2}' and origen = 'beca'`);
  const antesReenvio = becas();
  const anonimo = await navegador.newContext();
  const estados = [];
  for (const contexto of [ctx2, anonimo]) {
    if (!pedido) break;
    const r = await contexto.request.fetch(pedido.url, { method: 'POST', maxRedirects: 0, data: pedido.cuerpo, headers: {
      'Next-Action': pedido.cabeceras['next-action'], 'Content-Type': pedido.cabeceras['content-type'], Accept: 'text/x-component', Origin: BASE } });
    estados.push(r.status());
  }
  comprobar(Boolean(pedido) && estados.every((e) => e === 404) && becas() === antesReenvio,
    `la acción de becas reenviada por una alumna o un visitante se rechaza (${estados.join(', ')}) y no crea nada`);
  const beca = sql(`select id || '|' || origen || '|' || responsable || '|' || (vence_en is not null)::text from public.periodos_acceso where perfil_id = '${alumna2}' and origen = 'beca' and estado = 'activo'`);
  comprobar(beca.endsWith('|beca|Maestra titular|true'), 'la beca registra origen, responsable y fecha de fin');
  comprobar(sql(`select count(*) from public.ordenes where perfil_id = '${alumna2}' and creado_en > now() - interval '5 minutes' and estado = 'pendiente'`) === '0',
    'la beca no crea compras');
  comprobar(sql(`select (vence_en > now())::text from public.accesos_curso where id = '${accesoId}'`) === 'true', 'con la beca vuelve a tener acceso, en la misma inscripción');
  await a.screenshot({ path: `${SALIDA}/recorrido-renovaciones-4-beca.png`, fullPage: true });
  await a.locator('li', { hasText: 'Beca de prueba por continuidad' }).getByRole('button', { name: 'Revocar' }).first().click();
  await a.locator('dialog[open] textarea[name=motivo]').fill('Revocación de prueba del recorrido');
  await a.locator('dialog[open]').getByRole('button', { name: 'Revocar' }).click();
  comprobar(await a.getByText(/Beca revocada/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'la admin revoca la beca con motivo');
  comprobar(sql(`select (vence_en <= now())::text from public.accesos_curso where id = '${accesoId}'`) === 'true'
    && sql(`select count(*) from public.certificados where perfil_id = '${alumna2}' and curso_id = '${C1}'`) === '1', 'revocada: vuelve a estar vencido y conserva su certificado');

  // ---------------------------------------------------------------- 5. Permisos por la API
  if (API_URL && ANON_KEY) {
    const token = (await (await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: CORREO2, password: CLAVE2 }),
    })).json()).access_token;
    const cab = { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const r1 = await fetch(`${API_URL}/rest/v1/rpc/otorgar_beca`, { method: 'POST', headers: cab,
      body: JSON.stringify({ p_perfil: alumna2, p_curso: C1, p_inicio: null, p_fin: null, p_sin_vencimiento: true, p_motivo: 'Me la otorgo a mí misma', p_responsable: 'Yo' }) });
    const r2 = await fetch(`${API_URL}/rest/v1/periodos_acceso?select=id,motivo`, { headers: cab });
    const filas = r2.ok ? await r2.json() : [];
    const r3 = await fetch(`${API_URL}/rest/v1/rpc/buscar_perfil_por_correo`, { method: 'POST', headers: cab, body: JSON.stringify({ p_correo: CORREO }) });
    comprobar(!r1.ok && Array.isArray(filas) && filas.length === 0 && !r3.ok, `una alumna no se otorga becas (${r1.status}), no lee períodos ni busca personas (${r3.status})`);
  } else comprobar(false, 'faltan API_URL y ANON_KEY');

  // ---------------------------------------------------------------- 6. Talleres apagados para el público
  sql(`update public.configuracion_academia set talleres_publicos = false`);
  const pub = await (await navegador.newContext()).newPage();
  const lista = await pub.goto(`${BASE}/talleres`, { waitUntil: 'networkidle' });
  const ficha = await pub.context().request.get(`${BASE}/talleres/demo-taller-ambiente`);
  comprobar(lista?.status() === 404 && ficha.status() === 404, `apagados: sin listado (${lista?.status()}) ni ficha (${ficha.status()})`);
  await pub.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  comprobar((await pub.getByRole('heading', { name: 'Talleres en vivo' }).count()) === 0
    && (await pub.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Talleres' }).count()) === 0, 'apagados: el inicio y el menú no los promocionan');
  const mapa = await (await pub.context().request.get(`${BASE}/sitemap.xml`)).text();
  comprobar(!mapa.includes('/talleres'), 'apagados: el mapa del sitio no los incluye');
  await pub.screenshot({ path: `${SALIDA}/recorrido-renovaciones-5-sin-talleres.png`, fullPage: true });
  const { p: al1 } = await sesion(CORREO, CLAVE);
  await al1.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  comprobar(await al1.getByText('Límites con respeto').first().isVisible(), 'apagados: quien ya estaba inscripta sigue viendo su taller');
  await a.goto(`${BASE}/admin/configuracion`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText('No ofrecidos todavía').isVisible(), 'el panel informa que los talleres no se ofrecen todavía');
  await a.goto(`${BASE}/admin/talleres`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText('Límites con respeto').first().isVisible(), 'la admin sigue trabajando con los talleres');
  sql(`update public.configuracion_academia set talleres_publicos = true`);

  // ---------------------------------------------------------------- 7. Conciliación y celular
  comprobar(sql(`select count(*) from public.conciliar_periodos()`) === '0', 'accesos y períodos concilian después del recorrido');
  const { p: m } = await sesion(ADMIN_CORREO, ADMIN_CLAVE, { width: 390, height: 844 });
  await m.goto(`${BASE}/admin/cursos/${C1}/alumnos`, { waitUntil: 'networkidle' });
  comprobar(await sinDesborde(m), 'celular, alumnos con períodos y becas: sin desborde horizontal');
  await m.screenshot({ path: `${SALIDA}/movil-renovaciones-alumnos.png`, fullPage: true });
  const { p: mc } = await sesion(CORREO2, CLAVE2, { width: 390, height: 844 });
  await mc.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  comprobar(await sinDesborde(mc), 'celular, campus con renovación y certificado: sin desborde horizontal');
  await mc.screenshot({ path: `${SALIDA}/movil-renovaciones-campus.png`, fullPage: true });
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${a?.url()})`);
  await a?.screenshot({ path: `${SALIDA}/recorrido-renovaciones-error.png`, fullPage: true }).catch(() => {});
  await al2?.screenshot({ path: `${SALIDA}/recorrido-renovaciones-error-alumna.png`, fullPage: true }).catch(() => {});
  sql(`update public.configuracion_academia set talleres_publicos = true`);
}
for (const e of errores) console.log(`  error en consola: ${e}`);
comprobar(errores.length === 0, 'sin errores en la consola');
await navegador.close();
process.exit(fallas ? 1 : 0);
