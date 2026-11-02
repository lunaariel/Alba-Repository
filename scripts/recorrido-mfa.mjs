// Recorrido de seguridad de la Fase 6A (CI y local, SOLO con el Supabase local): segundo factor de la
// administradora, verificación reforzada y recuperación de acceso, con siete perfiles: visitante, alumna,
// segunda alumna, admin sin segundo factor, admin con segundo factor, admin con verificación antigua y admin
// tras la recuperación. Cada rechazo se comprueba también en la base (nada cambió).
// Enciende la política al empezar y la apaga al terminar (pase lo que pase). Se ejecuta al final de la
// verificación: deja la cuenta admin sin factores y la política apagada, como estaba.
import { mkdir, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { BASE, SALIDA, sql, sqlArchivo, crearInforme, navegadorNuevo, sinDesborde, espera } from './lib/recorrido.mjs';

const { CORREO, CLAVE, CORREO2, CLAVE2, ADMIN_CORREO, ADMIN_CLAVE, API_URL, ANON_KEY, LECCION } = process.env;
const C1 = 'c1000000-0000-0000-0000-000000000001';
const C3 = 'c1000000-0000-0000-0000-000000000003';
const RESPONSABLE = "'Recorrido de seguridad (CI)'";
const { comprobar, vigilar, estado } = crearInforme();
const politica = (activa, minutos = 5) => sqlArchivo('scripts/politica-mfa.sql', { activa, minutos, responsable: RESPONSABLE });
const precio = (curso) => Number(sql(`select precio_centavos from public.cursos where id = '${curso}'`));

// Códigos TOTP generados como lo haría la app autenticadora (biblioteca estándar, RFC 6238). Cada operación
// usa un código de un intervalo nuevo, como una persona que espera el siguiente código.
let ultimoPaso = -1;
const usados = [];
async function codigo(secreto) {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secreto.replace(/\s/g, '')), digits: 6, period: 30, algorithm: 'SHA1' });
  while (Math.floor(Date.now() / 30000) === ultimoPaso) await espera(1000);
  ultimoPaso = Math.floor(Date.now() / 30000);
  const c = totp.generate();
  usados.push(c);
  return c;
}
const cliente = () => createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const rest = (token, ruta, init = {}) => fetch(`${API_URL}/rest/v1/${ruta}`, {
  ...init, headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
});

async function ingresar(p, correo, clave) {
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', correo);
  await p.fill('#contrasena', clave);
  await Promise.all([p.waitForURL((u) => u.pathname !== '/ingresar', { timeout: 20000 }), p.click('button[type=submit]')]);
  await p.waitForLoadState('networkidle');
  return new URL(p.url()).pathname;
}

await mkdir(SALIDA, { recursive: true });
const navegador = await navegadorNuevo();
const ADMIN_ID = sql(`select id from auth.users where email = '${ADMIN_CORREO}'`);
let secreto = '';
let secretoRespaldo = '';
let rolesCreados = false;
const auditoriaAntes = Number(sql('select count(*) from public.auditoria'));
const INICIO = sql('select now()');

try {
  politica(true, 5);
  comprobar(sql('select mfa_admin_obligatorio from public.politica_seguridad') === 't', 'la política de segundo factor se enciende por script con responsable');

  // ------------------------------------------------------------ 1. Visitante sin sesión
  const visitante = await (await navegador.newContext()).newPage();
  vigilar(visitante);
  const rAdmin = await visitante.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  comprobar(rAdmin?.status() === 404, 'visitante: /admin responde 404');
  await visitante.goto(`${BASE}/segundo-factor/activar`, { waitUntil: 'networkidle' });
  comprobar(new URL(visitante.url()).pathname === '/ingresar', 'visitante: la activación del segundo factor lleva a ingresar');
  const csp = rAdmin?.headers()['content-security-policy'] ?? '';
  comprobar(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && !/unsafe-eval/.test(csp), 'la respuesta lleva la CSP con nonce y sin unsafe-eval');

  // ------------------------------------------------------------ 2. Alumna: sin cambios en su ingreso; su propio factor no da permisos
  const ctxAlumna = await navegador.newContext();
  const alumna = await ctxAlumna.newPage();
  vigilar(alumna);
  comprobar(await ingresar(alumna, CORREO, CLAVE) === '/campus', 'alumna: ingresa al campus sin que se le pida segundo factor');
  comprobar((await alumna.goto(`${BASE}/admin`, { waitUntil: 'networkidle' }))?.status() === 404, 'alumna: /admin responde 404');
  comprobar((await alumna.goto(`${BASE}/segundo-factor/activar`, { waitUntil: 'networkidle' }))?.status() === 404, 'alumna: la activación de admin responde 404');
  // Por la API registra su propio factor TOTP y llega a aal2: sigue sin ser admin para la base.
  const sa = cliente();
  await sa.auth.signInWithPassword({ email: CORREO, password: CLAVE });
  const { data: enr } = await sa.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Alumna' });
  const vAlumna = await sa.auth.mfa.challengeAndVerify({ factorId: enr.id, code: await codigo(enr.totp.secret) });
  const tokenAlumna = (await sa.auth.getSession()).data.session?.access_token;
  const aalAlumna = JSON.parse(Buffer.from(tokenAlumna.split('.')[1], 'base64url').toString()).aal;
  comprobar(!vAlumna.error && aalAlumna === 'aal2', 'alumna: registra su propio factor y su sesión llega a aal2');
  const esAdminAlumna = await (await rest(tokenAlumna, 'rpc/es_admin', { method: 'POST', body: '{}' })).json();
  comprobar(esAdminAlumna === false, 'alumna con aal2: es_admin() sigue siendo falso');
  const p1 = precio(C1);
  await rest(tokenAlumna, `cursos?id=eq.${C1}`, { method: 'PATCH', body: JSON.stringify({ precio_centavos: 1 }) });
  comprobar(precio(C1) === p1, 'alumna con aal2: no cambia precios (verificado en la base)');
  const opciones = await (await rest(tokenAlumna, 'opciones?select=es_correcta&limit=1')).json();
  comprobar(!Array.isArray(opciones), 'alumna: las respuestas correctas siguen sin poder leerse por la API');

  // ------------------------------------------------------------ 3. Segunda alumna: no ve datos académicos, comerciales ni privados de la primera
  const sb = cliente();
  await sb.auth.signInWithPassword({ email: CORREO2, password: CLAVE2 });
  const tokenB = (await sb.auth.getSession()).data.session?.access_token;
  const ALUMNA_ID = sql(`select id from auth.users where email = '${CORREO}'`);
  for (const [tabla, texto] of [['intentos_evaluacion', 'intentos'], ['certificados', 'certificados'], ['periodos_acceso', 'períodos comerciales'],
    ['ordenes', 'órdenes'], ['pagos', 'pagos'], ['accesos_curso', 'accesos']]) {
    const r = await rest(tokenB, `${tabla}?select=id&perfil_id=eq.${ALUMNA_ID}`);
    const filas = r.ok ? await r.json() : [];
    comprobar(Array.isArray(filas) && filas.length === 0, `segunda alumna: no lee ${texto} de la primera`);
  }
  const lista = await sb.storage.from('materiales').list('cursos', { limit: 5 });
  comprobar(!lista.data?.length, 'segunda alumna: no lista el almacenamiento privado');

  // ------------------------------------------------------------ 4. Admin sin segundo factor (política encendida)
  const ctxAdmin = await navegador.newContext();
  const admin = await ctxAdmin.newPage();
  vigilar(admin);
  const destino = await ingresar(admin, ADMIN_CORREO, ADMIN_CLAVE);
  comprobar(destino === '/segundo-factor/activar', 'admin sin factor: al ingresar se le pide activar el segundo factor');
  await admin.goto(`${BASE}/admin/cursos`, { waitUntil: 'networkidle' });
  comprobar(new URL(admin.url()).pathname.startsWith('/segundo-factor'), 'admin sin factor: el panel no se muestra (va al segundo factor)');
  const sAal1 = cliente();
  await sAal1.auth.signInWithPassword({ email: ADMIN_CORREO, password: ADMIN_CLAVE });
  const tokenAal1 = (await sAal1.auth.getSession()).data.session?.access_token;
  const audit = await (await rest(tokenAal1, 'auditoria?select=id&limit=1')).json();
  comprobar(Array.isArray(audit) && audit.length === 0, 'admin aal1 por la API: no lee la auditoría');
  const p3 = precio(C3);
  await rest(tokenAal1, `cursos?id=eq.${C3}`, { method: 'PATCH', body: JSON.stringify({ precio_centavos: 1234 }) });
  comprobar(precio(C3) === p3, 'admin aal1 por la API: no cambia precios (verificado en la base)');
  const pub = await rest(tokenAal1, 'rpc/publicar_version', { method: 'POST', body: JSON.stringify({ p_curso: C1, p_resumen: 'x' }) });
  comprobar(!pub.ok, 'admin aal1 por la API: no publica versiones');

  // ------------------------------------------------------------ 5. Activación y acceso con segundo factor
  await admin.goto(`${BASE}/segundo-factor/activar`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: 'Generar el código QR' }).click();
  await admin.locator('[data-secreto-totp]').waitFor({ state: 'attached', timeout: 15000 });
  secreto = (await admin.locator('[data-secreto-totp]').textContent())?.trim() ?? '';
  comprobar(/^[A-Z2-7]{16,}$/.test(secreto) && await admin.getByAltText('Código QR para la app autenticadora').isVisible(), 'activación: se muestran el código QR y la clave de Supabase Auth');
  await admin.fill('#codigo', '000000');
  await admin.getByRole('button', { name: 'Confirmar y activar' }).click();
  comprobar(await admin.getByText(/El código no coincide/).waitFor({ timeout: 15000 }).then(() => true, () => false), 'activación: un código incorrecto se rechaza');
  await admin.fill('#codigo', await codigo(secreto));
  await Promise.all([admin.waitForURL(/ok=1/, { timeout: 20000 }), admin.getByRole('button', { name: 'Confirmar y activar' }).click()]);
  comprobar(await admin.getByText('Segundo factor activo.').isVisible(), 'activación: confirmada con un código válido');
  comprobar(sql(`select count(*) from auth.mfa_factors where user_id = '${ADMIN_ID}' and status = 'verified'`) === '1', 'el factor queda en Supabase Auth (auth.mfa_factors)');
  comprobar(sql(`select count(*) from public.auditoria where accion = 'segundo_factor_activado' and actor_id = '${ADMIN_ID}' and creado_en >= '${INICIO}'`) === '1', 'la activación queda en la auditoría de la academia');
  const r200 = await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  comprobar(r200?.status() === 200 && new URL(admin.url()).pathname === '/admin', 'admin con segundo factor: entra al panel');
  await admin.goto(`${BASE}/admin/configuracion`, { waitUntil: 'networkidle' });
  comprobar(await admin.getByText('Segundo factor exigido').isVisible() && await admin.getByText('Principal').isVisible(), 'configuración muestra la política y el factor registrado');
  // Factor de respaldo (segundo dispositivo), desde Configuración.
  await Promise.all([admin.waitForURL(/\/segundo-factor\/activar/), admin.getByRole('link', { name: 'Agregar un factor de respaldo' }).click()]);
  await admin.getByRole('button', { name: 'Generar el código QR' }).click();
  await admin.locator('[data-secreto-totp]').waitFor({ state: 'attached', timeout: 15000 });
  secretoRespaldo = (await admin.locator('[data-secreto-totp]').textContent())?.trim() ?? '';
  await admin.fill('#codigo', await codigo(secretoRespaldo));
  await Promise.all([admin.waitForURL(/ok=1/, { timeout: 20000 }), admin.getByRole('button', { name: 'Confirmar y activar' }).click()]);
  comprobar(secretoRespaldo !== secreto && sql(`select count(*) from auth.mfa_factors where user_id = '${ADMIN_ID}' and status = 'verified'`) === '2',
    'se registra un factor de respaldo con su propia clave');

  // Reingreso: contraseña y código.
  await ctxAdmin.clearCookies();
  comprobar(await ingresar(admin, ADMIN_CORREO, ADMIN_CLAVE) === '/segundo-factor', 'reingreso: tras la contraseña se pide el código');
  await admin.fill('#codigo', '123456');
  await admin.getByRole('button', { name: 'Verificar' }).click();
  comprobar(await admin.getByText(/El código no es válido/).waitFor({ timeout: 15000 }).then(() => true, () => false), 'reingreso: un código incorrecto no da acceso');
  await admin.fill('#codigo', await codigo(secreto));
  // El ingreso vuelve a donde iba (el campus por defecto, como antes); desde ahí el panel ya abre.
  await Promise.all([admin.waitForURL((u) => u.pathname === '/campus', { timeout: 20000 }), admin.getByRole('button', { name: 'Verificar' }).click()]);
  const panel = await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  comprobar(panel?.status() === 200 && new URL(admin.url()).pathname === '/admin', 'reingreso: con el código correcto entra al panel');
  // Pérdida del teléfono principal: se ingresa con el factor de respaldo (primer paso de la recuperación).
  const ctxRespaldo = await navegador.newContext();
  const pr = await ctxRespaldo.newPage();
  vigilar(pr);
  comprobar(await ingresar(pr, ADMIN_CORREO, ADMIN_CLAVE) === '/segundo-factor', 'respaldo: tras la contraseña se pide el código');
  await pr.fill('#codigo', await codigo(secretoRespaldo));
  await Promise.all([pr.waitForURL((u) => u.pathname === '/campus', { timeout: 20000 }), pr.getByRole('button', { name: 'Verificar' }).click()]);
  comprobar((await pr.goto(`${BASE}/admin`, { waitUntil: 'networkidle' }))?.status() === 200, 'respaldo: con el código del segundo dispositivo entra al panel, sin procedimiento excepcional');
  await ctxRespaldo.close();

  // ------------------------------------------------------------ 6. Operaciones sensibles en el panel
  await admin.goto(`${BASE}/admin/cursos/${C3}`, { waitUntil: 'networkidle' });
  const precioAntes = precio(C3);
  await admin.fill('#precio', '71');
  await admin.getByRole('button', { name: 'Guardar cambios' }).click();
  comprobar(await admin.getByText(/Escriba el código de 6 dígitos/).first().waitFor({ timeout: 15000 }).then(() => true, () => false)
    && precio(C3) === precioAntes, 'cambiar un precio sin código: se pide el código y el precio no cambia');
  // (El formulario vuelve a sus valores guardados después de cada envío: se escribe el precio otra vez.)
  await admin.fill('#precio', '71');
  await admin.fill('input[name=codigo_reforzado]', '000000');
  await admin.getByRole('button', { name: 'Guardar cambios' }).click();
  comprobar(await admin.getByText(/El código no es válido o ya cambió/).first().waitFor({ timeout: 15000 }).then(() => true, () => false)
    && precio(C3) === precioAntes, 'con un código incorrecto: rechazado y el precio no cambia');
  await admin.fill('#precio', '71');
  await admin.fill('input[name=codigo_reforzado]', await codigo(secreto));
  await admin.getByRole('button', { name: 'Guardar cambios' }).click();
  comprobar(await admin.getByText('Cambios guardados.').first().waitFor({ timeout: 15000 }).then(() => true, () => false) && precio(C3) === 7100,
    'con el código del momento: el precio cambia');
  comprobar(sql(`select count(*) from public.verificaciones_reforzadas where perfil_id = '${ADMIN_ID}' and accion = 'curso_precio_o_publicacion' and usada_en >= '${INICIO}'`) === '1'
    && sql(`select count(*) from public.auditoria where accion = 'verificacion_reforzada' and actor_id = '${ADMIN_ID}' and creado_en >= '${INICIO}'`) === '1',
    'la verificación queda consumida y auditada (sin guardar el código)');
  // Cambio rutinario: no pide código.
  await admin.fill('#titulo', 'Ambiente preparado de 3 a 6 años');
  await admin.getByRole('button', { name: 'Guardar cambios' }).click();
  comprobar(await admin.getByText('Cambios guardados.').first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'un cambio rutinario (título) no pide código');
  // Bloqueo excepcional con el diálogo de confirmación: palabra y código.
  if (LECCION) {
    await admin.goto(`${BASE}/admin/cursos/${C1}/temario/${LECCION}`, { waitUntil: 'networkidle' });
    await admin.getByRole('button', { name: 'Bloquear la lección' }).click();
    const dialogo = admin.locator('dialog[open]');
    await dialogo.locator('textarea[name=motivo]').fill('Prueba de verificación reforzada en el recorrido de seguridad.');
    await dialogo.locator('input[name=confirmacion]').fill('BLOQUEAR');
    const boton = dialogo.getByRole('button', { name: 'Bloquear la lección' });
    comprobar(await boton.isDisabled(), 'el diálogo no habilita la confirmación sin el código');
    await dialogo.locator('input[name=codigo_reforzado]').fill(await codigo(secreto));
    await Promise.all([admin.waitForURL(/ok=bloqueado/, { timeout: 20000 }), boton.click()]);
    comprobar(sql(`select bloqueada from public.lecciones where id = '${LECCION}'`) === 't', 'con palabra y código, el bloqueo se aplica');
    await admin.getByRole('button', { name: 'Desbloquear' }).first().click();
    const d2 = admin.locator('dialog[open]');
    await d2.locator('textarea[name=motivo]').fill('Fin de la prueba de verificación reforzada.');
    await d2.locator('input[name=confirmacion]').fill('DESBLOQUEAR');
    await d2.locator('input[name=codigo_reforzado]').fill(await codigo(secreto));
    await Promise.all([admin.waitForURL(/ok=desbloqueado/, { timeout: 20000 }), d2.getByRole('button', { name: 'Desbloquear' }).click()]);
    comprobar(sql(`select bloqueada from public.lecciones where id = '${LECCION}'`) === 'f', 'y se revierte con otra verificación');
  }

  // ------------------------------------------------------------ 7. Directo a la API: un solo uso y verificación antigua
  politica(true, 1);
  const sApi = cliente();
  await sApi.auth.signInWithPassword({ email: ADMIN_CORREO, password: ADMIN_CLAVE });
  const factores = (await sApi.auth.mfa.listFactors()).data.totp.filter((f) => f.friendly_name === 'Principal');
  await sApi.auth.mfa.challengeAndVerify({ factorId: factores[0].id, code: await codigo(secreto) });
  const tokenAal2 = (await sApi.auth.getSession()).data.session?.access_token;
  const r1 = await rest(tokenAal2, `cursos?id=eq.${C3}`, { method: 'PATCH', body: JSON.stringify({ precio_centavos: 7200 }) });
  comprobar(r1.ok && precio(C3) === 7200, 'API con verificación reciente: una operación sensible procede');
  const r2 = await rest(tokenAal2, `cursos?id=eq.${C3}`, { method: 'PATCH', body: JSON.stringify({ precio_centavos: 7300 }) });
  comprobar(!r2.ok && /verificacion_reforzada_usada/.test(await r2.text()) && precio(C3) === 7200, 'la misma verificación no sirve para una segunda operación');
  await espera(65_000);
  const sApi2 = cliente();
  await sApi2.auth.signInWithPassword({ email: ADMIN_CORREO, password: ADMIN_CLAVE });
  await sApi2.auth.mfa.challengeAndVerify({ factorId: factores[0].id, code: await codigo(secreto) });
  const tokenViejo = (await sApi2.auth.getSession()).data.session?.access_token;
  await espera(65_000);
  const r3 = await rest(tokenViejo, `cursos?id=eq.${C3}`, { method: 'PATCH', body: JSON.stringify({ precio_centavos: 7400 }) });
  comprobar(!r3.ok && /verificacion_reforzada_requerida/.test(await r3.text()) && precio(C3) === 7200, 'sesión antigua (verificada hace más de la vigencia): rechazada, sin cambios');
  const r4 = await rest(tokenViejo, `cursos?id=eq.${C3}&select=titulo`, { method: 'PATCH', body: JSON.stringify({ titulo: 'Ambiente preparado de 3 a 6 años' }) });
  comprobar(r4.ok, 'sesión antigua: las operaciones rutinarias siguen funcionando');
  politica(true, 5);

  // ------------------------------------------------------------ 8. Celular y escritorio
  for (const ancho of [390, 1440]) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    const p = await ctx.newPage();
    vigilar(p);
    await ingresar(p, ADMIN_CORREO, ADMIN_CLAVE);
    await p.screenshot({ path: `${SALIDA}/recorrido-mfa-segundo-factor-${ancho}.png`, fullPage: true });
    comprobar(new URL(p.url()).pathname === '/segundo-factor' && await sinDesborde(p), `${ancho}px: la pantalla del código cabe sin desborde`);
    await ctx.close();
  }

  // ------------------------------------------------------------ 9. Recuperación excepcional con dos personas (perdió todos los factores)
  // Dos usuarios de base de datos de prueba (solo en esta base local), designados con el script del procedimiento.
  sql(`create role ci_tecnico login password 'clave-ci-tecnico'; create role ci_aprobador login password 'clave-ci-aprobador'`);
  rolesCreados = true;
  sqlArchivo('scripts/recuperacion-designar.sql', { usuario_bd: "'ci_tecnico'", rol: "'albor_recuperacion_tecnico'", accion: "'designar'", responsable: RESPONSABLE });
  sqlArchivo('scripts/recuperacion-designar.sql', { usuario_bd: "'ci_aprobador'", rol: "'albor_recuperacion_aprobador'", accion: "'designar'", responsable: RESPONSABLE });
  const comoTecnico = DB.replace('postgres:postgres@', 'ci_tecnico:clave-ci-tecnico@');
  const comoAprobador = DB.replace('postgres:postgres@', 'ci_aprobador:clave-ci-aprobador@');
  let rechazo = '';
  try { sqlArchivo('scripts/recuperacion-solicitar.sql', { correo: `'${ADMIN_CORREO}'`, motivo: "'Pérdida de los dos dispositivos.'", canal: "'Canal de prueba (CI)'" }); }
  catch (e) { rechazo = String(e.stderr ?? e); }
  comprobar(/no_autorizado/.test(rechazo), 'recuperación: el dueño de la base sin designación no puede iniciarla');
  const solicitud = sqlArchivo('scripts/recuperacion-solicitar.sql', { correo: `'${ADMIN_CORREO}'`, motivo: "'Prueba: pérdida de los dos dispositivos.'",
    canal: "'Canal de prueba previamente acordado (CI)'" }, comoTecnico).split('\n').pop();
  comprobar(/^[0-9a-f-]{36}$/.test(solicitud) && sql(`select count(*) from auth.mfa_factors where user_id = '${ADMIN_ID}'`) === '2',
    'recuperación: el responsable técnico registra la solicitud; todavía no se quita nada');
  rechazo = '';
  try { sqlArchivo('scripts/recuperacion-aprobar.sql', { solicitud: `'${solicitud}'`, verificacion: "'Intento unilateral del técnico.'" }, comoTecnico); }
  catch (e) { rechazo = String(e.stderr ?? e); }
  comprobar(/permission denied/.test(rechazo) && sql(`select count(*) from auth.mfa_factors where user_id = '${ADMIN_ID}'`) === '2',
    'recuperación: el técnico no puede aprobarla por decisión unilateral');
  sqlArchivo('scripts/recuperacion-aprobar.sql', { solicitud: `'${solicitud}'`, verificacion: "'Verificación independiente de prueba (CI).'" }, comoAprobador);
  comprobar(sql(`select count(*) from auth.mfa_factors where user_id = '${ADMIN_ID}'`) === '0' && sql(`select count(*) from auth.sessions where user_id = '${ADMIN_ID}'`) === '0',
    'recuperación: con la aprobación independiente se quitan los factores comprometidos y se cierran todas las sesiones');
  comprobar(sql(`select count(*) from public.auditoria where accion = 'recuperacion_mfa_ejecutada' and entidad_id = '${solicitud}' and despues ->> 'solicitada_por' = 'ci_tecnico' and despues ->> 'aprobada_por' = 'ci_aprobador'`) === '1',
    'recuperación: queda auditada con las dos personas');
  const tras = await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  comprobar(tras?.status() === 404 || !new URL(admin.url()).pathname.startsWith('/admin'), 'tras la recuperación, la sesión anterior ya no entra al panel');
  comprobar(await ingresar(admin, ADMIN_CORREO, ADMIN_CLAVE) === '/segundo-factor/activar', 'tras la recuperación, el próximo ingreso exige activar un factor nuevo');

  // ------------------------------------------------------------ 10. Secretos y códigos fuera de registros y tablas
  const log = await readFile('servidor.log', 'utf8').catch(() => '');
  comprobar(!log.includes(secreto) && !log.includes(secretoRespaldo) && !usados.some((c) => log.includes(c)), 'el registro del servidor no contiene la clave ni los códigos');
  comprobar([secreto, secretoRespaldo].every((k) => sql(`select count(*) from public.auditoria where despues::text like '%${k}%' or antes::text like '%${k}%'`) === '0'
    && sql(`select count(*) from public.recuperaciones_mfa where row_to_json(recuperaciones_mfa)::text like '%${k}%'`) === '0'), 'la auditoría y la recuperación no contienen las claves TOTP');
  comprobar(Number(sql('select count(*) from public.auditoria')) > auditoriaAntes, 'las acciones críticas del recorrido quedaron en la auditoría');
} finally {
  politica(false, 5);
  if (rolesCreados) {
    for (const [u, r] of [['ci_tecnico', 'albor_recuperacion_tecnico'], ['ci_aprobador', 'albor_recuperacion_aprobador']]) {
      try { sqlArchivo('scripts/recuperacion-designar.sql', { usuario_bd: `'${u}'`, rol: `'${r}'`, accion: "'retirar'", responsable: RESPONSABLE }); } catch { /* ya retirado */ }
    }
    sql('drop role if exists ci_tecnico; drop role if exists ci_aprobador');
  }
  // Deja las cuentas como estaban (sin factores de prueba).
  sql(`delete from auth.mfa_factors where user_id in (select id from auth.users where email in ('${CORREO}', '${ADMIN_CORREO}'))`);
  comprobar(sql('select mfa_admin_obligatorio from public.politica_seguridad') === 'f', 'al terminar, la política queda apagada como estaba');
  await navegador.close();
}
for (const e of estado.errores) console.log(`  error en consola: ${e}`);
comprobar(estado.errores.length === 0, 'sin errores en la consola');
process.exit(estado.fallas ? 1 : 0);
