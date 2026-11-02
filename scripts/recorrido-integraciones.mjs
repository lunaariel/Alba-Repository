// Integraciones simuladas de la Fase 6B (CI y local, SOLO con el Supabase local y VIDEO_PROVEEDOR=simulado).
// Video: la alumna con acceso ve el reproductor con un enlace temporal firmado; manipulado (403) o vencido (410) no
// sirve; otra alumna sin acceso no llega a la lección; con el acceso vencido la base no autoriza el video.
// Correo: el proceso programado trata la cola con el simulador: queda «simulado», nunca «enviado».
// Secretos: no aparecen en páginas, respuestas ni registros; las alumnas no leen la cola ni las plantillas.
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BASE, sql, crearInforme, navegadorNuevo, tokenPorClave } from './lib/recorrido.mjs';

const { CORREO, CLAVE, CORREO2, CLAVE2, API_URL, ANON_KEY, SERVICE_ROLE_KEY, VIDEO_SIMULADO_SECRETO, PROCESOS_CLAVE } = process.env;
const { comprobar, vigilar, estado } = crearInforme();
const C1 = 'c1000000-0000-0000-0000-000000000001';
const A = sql(`select id from auth.users where email = '${CORREO}'`);
const B = sql(`select id from auth.users where email = '${CORREO2}'`);
const LECCION = sql(`select l.id from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = '${C1}' and l.video_id is not null
  and exists (select 1 from public.lecciones_de_version(public.version_de('${A}', '${C1}')) v(id) where v.id = l.id) order by m.orden, l.orden limit 1`);
const servicio = (fn, args) => fetch(`${API_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
}).then((r) => r.json());

const navegador = await navegadorNuevo();
try {
  // ------------------------------------------------------------ 1. Video con acceso
  comprobar(Boolean(LECCION), 'hay una lección con video en la versión de la alumna');
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  vigilar(p);
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', CORREO);
  await p.fill('#contrasena', CLAVE);
  await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  await p.goto(`${BASE}/campus/cursos/demo-montessori-en-casa/lecciones/${LECCION}`, { waitUntil: 'networkidle' });
  const src = await p.locator('iframe').first().getAttribute('src').catch(() => null);
  comprobar(Boolean(src) && /^\/video-simulado\/[^?]+\?vence=\d+&firma=[0-9a-f]{64}$/.test(src), 'alumna con acceso: el reproductor recibe un enlace temporal firmado');
  const marco = p.frameLocator('iframe').first();
  comprobar(await marco.locator('[data-video-simulado]').isVisible({ timeout: 10000 }).catch(() => false), 'el reproductor simulado carga dentro de la lección (CSP y marcos permitidos solo para el propio sitio)');
  const url = new URL(src, BASE);
  const vence = Number(url.searchParams.get('vence'));
  comprobar(vence - Date.now() / 1000 <= 2 * 3600 + 5 && vence > Date.now() / 1000, 'el enlace vence en dos horas como máximo');
  const ok = await p.request.get(url.toString());
  comprobar(ok.status() === 200, 'el enlace firmado funciona');
  const manipulado = new URL(url); manipulado.searchParams.set('vence', String(vence + 86400));
  comprobar((await p.request.get(manipulado.toString())).status() === 403, 'un enlace con el vencimiento alterado se rechaza (403)');
  const idVideo = decodeURIComponent(url.pathname.split('/').pop());
  const pasado = Math.floor(Date.now() / 1000) - 60;
  const firmaVieja = createHmac('sha256', VIDEO_SIMULADO_SECRETO).update(`${idVideo}:${pasado}`).digest('hex');
  comprobar((await p.request.get(`${BASE}/video-simulado/${encodeURIComponent(idVideo)}?vence=${pasado}&firma=${firmaVieja}`)).status() === 410, 'un enlace vencido se rechaza (410)');
  const otroVideo = sql(`select video_id from public.lecciones where video_id is not null and id <> '${LECCION}' limit 1`);
  comprobar((await p.request.get(`${BASE}/video-simulado/${encodeURIComponent(otroVideo)}?${url.searchParams}`)).status() === 403, 'la firma de un video no sirve para otro');
  const html = await p.content();
  const secretos = [SERVICE_ROLE_KEY, VIDEO_SIMULADO_SECRETO, PROCESOS_CLAVE].filter(Boolean);
  comprobar(secretos.every((s) => !html.includes(s)), 'la página de la lección no contiene secretos');
  comprobar(!html.includes(idVideo) || src.includes(idVideo), 'el id del video solo aparece dentro del enlace firmado');

  // ------------------------------------------------------------ 2. Sin acceso y con acceso vencido
  const ctxB = await navegador.newContext();
  const pb = await ctxB.newPage();
  vigilar(pb);
  await pb.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await pb.fill('#correo', CORREO2);
  await pb.fill('#contrasena', CLAVE2);
  await Promise.all([pb.waitForURL((u) => u.pathname === '/campus'), pb.click('button[type=submit]')]);
  const tieneB = sql(`select count(*) from public.accesos_curso where perfil_id = '${B}' and curso_id = '${C1}' and estado = 'activo' and public.acceso_cubierto(id)`) !== '0';
  if (!tieneB) {
    const r = await pb.goto(`${BASE}/campus/cursos/demo-montessori-en-casa/lecciones/${LECCION}`, { waitUntil: 'networkidle' });
    comprobar(r?.status() === 404 && (await pb.locator('iframe').count()) === 0, 'alumna sin acceso: la lección responde 404, sin reproductor');
  }
  const autorizacionB = await servicio('autorizar_video_leccion', { p_perfil: B, p_leccion: LECCION });
  comprobar(tieneB ? autorizacionB.estado === 'autorizado' : ['sin_acceso', 'acceso_vencido'].includes(autorizacionB.estado), `la base decide por la alumna B: ${autorizacionB.estado}`);
  // Vencido: se simula el paso del tiempo para A en una transacción que se deshace (no cambia la base).
  const vencido = sql(`begin;
    alter table public.periodos_acceso disable trigger periodos_inmutables;
    update public.periodos_acceso set inicia_en = inicia_en - interval '3 years', vence_en = vence_en - interval '3 years' where perfil_id = '${A}' and curso_id = '${C1}';
    alter table public.periodos_acceso enable trigger periodos_inmutables;
    select set_config('albor.ajuste_vencimiento', 'si', true);
    update public.accesos_curso set inicia_en = inicia_en - interval '3 years', vence_en = vence_en - interval '3 years' where perfil_id = '${A}' and curso_id = '${C1}';
    select public.autorizar_video_leccion('${A}', '${LECCION}') ->> 'estado';
    rollback;`).split('\n').filter((l) => /^[a-z_]+$/.test(l)).pop();
  comprobar(vencido === 'acceso_vencido', `con el acceso vencido, la base no autoriza el video (${vencido})`);
  const tokenA = await tokenPorClave(API_URL, ANON_KEY, CORREO, CLAVE);
  const directa = await fetch(`${API_URL}/rest/v1/rpc/autorizar_video_leccion`, { method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_perfil: A, p_leccion: LECCION }) });
  comprobar(!directa.ok, 'una alumna no puede pedir la autorización de video directamente a la base');
  const columna = await fetch(`${API_URL}/rest/v1/lecciones?select=video_id&limit=1`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` } });
  comprobar(!columna.ok, 'ni leer los ids privados de video');

  // ------------------------------------------------------------ 3. Correo simulado (y avisos de vencimiento)
  // Persona de prueba (solo en esta base local) con una beca que termina en 5 días: el proceso le registra el aviso de 7.
  const P = sql(`insert into auth.users (id, email, raw_user_meta_data, aud, role) values (gen_random_uuid(), 'aviso.e2e@albor.invalid',
    '{"nombre_completo": "Persona Aviso (ejemplo)", "confirma_mayoria_edad": true}', 'authenticated', 'authenticated') returning id`).split('\n')[0];
  sql(`select public.agregar_periodo('${P}', '${C1}', 'beca', null, null, now() + interval '5 days', null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Beca de prueba de avisos (E2E)', 'Recorrido', null)`);
  const pendientes = Number(sql(`select count(*) from public.envios_correo where estado = 'pendiente'`));
  comprobar(pendientes >= 1, `hay correos en la cola (confirmaciones de compra de los datos de ejemplo: ${pendientes})`);
  const proc = await fetch(`${BASE}/api/procesos`, { method: 'POST', headers: { Authorization: `Bearer ${PROCESOS_CLAVE}` } });
  const cuerpo = await proc.json();
  comprobar(proc.ok && cuerpo.correos?.simulados >= 1 && cuerpo.correos?.enviados === 0, `el proceso programado trata la cola con el simulador (${JSON.stringify(cuerpo.correos)})`);
  comprobar(cuerpo.avisos_vencimiento?.registrados >= 1, `el proceso programado registra los avisos de vencimiento (${JSON.stringify(cuerpo.avisos_vencimiento)})`);
  comprobar(sql(`select (variables ->> 'umbral') || ':' || estado from public.envios_correo where perfil_id = '${P}' and plantilla_clave = 'aviso_vencimiento'`) === '7:simulado',
    'a 5 días del fin: aviso de 7 días, procesado como simulado');
  const repetir = await (await fetch(`${BASE}/api/procesos`, { method: 'POST', headers: { Authorization: `Bearer ${PROCESOS_CLAVE}` } })).json();
  comprobar(sql(`select count(*) from public.envios_correo where perfil_id = '${P}' and plantilla_clave = 'aviso_vencimiento'`) === '1' && repetir.avisos_vencimiento?.registrados === 0,
    'repetir el proceso no duplica el aviso');
  comprobar(sql(`select count(*) from public.envios_correo where estado = 'enviado'`) === '0', 'ningún correo figura como enviado');
  comprobar(sql(`select count(*) from public.envios_correo where estado = 'simulado' and enviado_en is null and proveedor = 'simulado'`) !== '0', 'los procesados quedan «simulado», sin fecha de envío');
  const sinClave = await fetch(`${BASE}/api/procesos`, { method: 'POST' });
  comprobar(sinClave.status === 401, 'el proceso programado exige su clave');
  for (const tabla of ['envios_correo', 'plantillas_correo']) {
    const r = await fetch(`${API_URL}/rest/v1/${tabla}?select=*&limit=1`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` } });
    const filas = r.ok ? await r.json() : [];
    comprobar(Array.isArray(filas) && filas.length === 0, `una alumna no lee ${tabla}`);
  }

  // ------------------------------------------------------------ 4. Secretos fuera de registros
  const log = await readFile('servidor.log', 'utf8').catch(() => '');
  comprobar(secretos.every((s) => !log.includes(s)), 'el registro del servidor no contiene secretos');
  comprobar(!log.includes(CLAVE) && !log.includes(CLAVE2), 'ni contraseñas');
} finally {
  await navegador.close();
}
for (const e of estado.errores) console.log(`  error en consola: ${e}`);
comprobar(estado.errores.length === 0, 'sin errores en la consola');
process.exit(estado.fallas ? 1 : 0);
